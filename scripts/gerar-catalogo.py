#!/usr/bin/env python3
"""Gera src/data/catalogo.json a partir das listas de músicas do aparelho (PDF).

Uso:
  python3 scripts/gerar-catalogo.py <pasta-com-os-pdfs>

Espera na pasta: nacionais.pdf, internacionais.pdf, italianas.pdf, infantis.pdf,
japonesas.pdf, evangelicas.pdf. Precisa do `pdftotext` (poppler-utils).
As novidades (PDF só de imagem, não dá pra ler por texto) vêm digitadas em
scripts/catalogo-novidades.csv e entram por último — vencem em caso de código repetido.

O layout dos PDFs é uma tabela do Excel: CANTOR | CÓD | TÍTULO | INÍCIO DA LETRA | extra.
As colunas são achadas pela posição X das palavras (pdftotext -bbox), não por espaços:
o título quase encosta no início da letra em algumas linhas.
"""
import csv
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'src' / 'data' / 'catalogo.json'
NOVIDADES = Path(__file__).resolve().parent / 'catalogo-novidades.csv'

# (arquivo, categoria, idioma pro title case)
FONTES = [
    ('nacionais', 'Nacionais', 'pt'),
    ('internacionais', 'Internacionais', 'en'),
    ('italianas', 'Italianas', 'it'),
    ('infantis', 'Infantis', 'pt'),
    ('japonesas', 'Japonesas', None),
    ('evangelicas', 'Evangélicas', 'pt'),
]
CATEGORIA_NOVIDADES = 'Novidades'

PEQUENAS = {
    'pt': {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os',
           'um', 'uma', 'com', 'por', 'pra', 'para', 'pro', 'ao', 'aos', 'ou', 'que', 'se'},
    'en': {'of', 'the', 'in', 'on', 'at', 'to', 'a', 'an', 'and', 'or', 'for', 'by', 'with', 'from', 'but', 'as'},
    'it': {'di', 'da', 'e', 'il', 'la', 'lo', 'le', 'a', 'in', 'per', 'con', 'un', 'una', 'del', 'della', 'o'},
}
MANTER_MAIUSCULA = {'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'dj', 'mc', 'tv', 'ok', 'usa', 'uk', 'dna', 'cd', 'abc', 'xv'}


def title_case(texto, idioma):
    """CAIXA ALTA -> Title Case, com artigos/preposições em minúscula."""
    pequenas = PEQUENAS.get(idioma, set())
    texto = re.sub(r'[´`’]', "'", re.sub(r'\s+', ' ', texto).strip()).lower()
    partes = re.split(r'(\s+|[-/("\[])', texto)
    saida = []
    primeiro = True
    apos_subtitulo = False
    for p in partes:
        if not p or re.fullmatch(r'\s+|[-/("\[]', p):
            if p in ('(', '-', '/', '"', '['):
                apos_subtitulo = True
            saida.append(p)
            continue
        sem_pontuacao = re.sub(r"[^a-zà-ÿ0-9']", '', p)
        if sem_pontuacao in MANTER_MAIUSCULA:
            saida.append(p.upper())
        elif sem_pontuacao in pequenas and not primeiro and not apos_subtitulo:
            saida.append(p)
        else:
            saida.append(re.sub(r'[a-zà-ÿ]', lambda m: m.group(0).upper(), p, count=1))
        primeiro = False
        apos_subtitulo = False
    return ''.join(saida).replace(" I'", " I'")


def palavras_da_pagina(pdf, pagina):
    xml = subprocess.run(
        ['pdftotext', '-bbox', '-f', str(pagina), '-l', str(pagina), str(pdf), '-'],
        capture_output=True, text=True, check=True,
    ).stdout
    out = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">(.*?)</word>', xml):
        t = m.group(4).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&apos;', "'")
        out.append((float(m.group(1)), float(m.group(2)), float(m.group(3)), t))
    return out


def agrupar_linhas(palavras):
    linhas = []
    for w in sorted(palavras, key=lambda w: (w[1], w[0])):
        if linhas and abs(linhas[-1][0] - w[1]) < 5.5:  # células de linhas altas desalinham até ~4.5pt; linhas distam ~12.7pt
            linhas[-1][1].append(w)
        else:
            linhas.append([w[1], [w]])
    return [sorted(ws, key=lambda w: w[0]) for _, ws in linhas]


def faixa_do_codigo(palavras):
    """Faixa X da coluna CÓD, pelo cabeçalho. A última coluna (página) também é numérica,
    então só a posição separa uma da outra."""
    cab = next((w for w in palavras if w[3] == 'CÓD'), None)
    return None if cab is None else (cab[0] - 12, cab[2] + 8)


def achar_inicio_da_letra(xs, linhas):
    """xs ordenado: xMin das palavras depois do título. A coluna da letra é alinhada à esquerda
    (xMin varia ~1pt conforme o 1º caractere), então procura o menor x onde uma janela de
    +-1.2pt junta a maioria das linhas da página. A última coluna (página/tag) também é
    assim, por isso o menor x. Agrupar por distância não serve: as palavras seguintes da
    letra formam uma faixa contínua que engole a coluna."""
    for x in xs:
        na_janela = [v for v in xs if abs(v - x) <= 1.2]
        if len(na_janela) >= linhas * 0.6:
            return min(na_janela)
    return float('inf')


def eh_cabecalho_ou_rodape(linha):
    """Título "LISTA DE MÚSICAS", cabeçalho "CANTOR | CÓD | ..." e rodapé "www...".
    Tem que olhar a linha toda: música com "LISTA" (A Lista) ou "CANTOR" no título
    não pode ser descartada."""
    textos = [w[3] for w in linha]
    return (
        ('LISTA' in textos and 'MÚSICAS' in textos)
        or ('CANTOR' in textos and 'CÓD' in textos)
        or any(t.startswith('www.') for t in textos)
    )


def ler_pdf(pdf, descartes):
    total = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', str(pdf)], capture_output=True, text=True).stdout).group(1))
    rows = []
    faixa = None
    for pg in range(1, total + 1):
        todas = palavras_da_pagina(pdf, pg)
        faixa = faixa_do_codigo(todas) or faixa
        linhas = [l for l in agrupar_linhas(todas) if not eh_cabecalho_ou_rodape(l)]
        achados = []
        orfas = []  # linhas só com nome de cantor, deslocadas em Y da linha do código
        for l in linhas:
            idx = next((i for i, w in enumerate(l)
                        if re.fullmatch(r'\d{1,5}', w[3]) and faixa[0] <= w[2] <= faixa[1]), None)
            if idx is None:
                if all(w[2] < faixa[0] for w in l):
                    orfas.append((l[0][1], ' '.join(w[3] for w in l)))
                elif not (len(l) == 1 and l[0][3].isdigit()):  # número de página solto no rodapé
                    descartes.append((pdf.stem, pg, ' '.join(w[3] for w in l)))
            else:
                achados.append((l, idx))
        com_titulo = [(l, i) for l, i in achados if i + 1 < len(l)]
        for l, i in achados:
            if i + 1 >= len(l):
                descartes.append((pdf.stem, pg, 'sem título: ' + ' '.join(w[3] for w in l)))
        if not com_titulo:
            continue
        titulo_x = Counter(round(l[i + 1][0], 1) for l, i in com_titulo).most_common(1)[0][0]
        # início da letra: o 1º cluster de xMin (a coluna é alinhada à esquerda, mas o xMin varia
        # ~1pt conforme o 1º caractere) depois do título com a maior parte das linhas.
        # A última coluna (página/tag) também é "cheia", por isso pega o mais à esquerda.
        letra_x = achar_inicio_da_letra(sorted(w[0] for l, i in com_titulo for w in l[i + 2:] if w[0] > titulo_x + 25), len(com_titulo))
        for l, i in com_titulo:
            artista = ' '.join(w[3] for w in l[:i])
            if not artista:
                artista = next((t for y, t in orfas if abs(y - l[i][1]) <= 6), '')
            titulo = ' '.join(w[3] for w in l[i + 1:] if w[0] < letra_x - 1.5)
            rows.append((l[i][3], titulo, artista, pg))
    return rows


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pasta = Path(sys.argv[1])
    categorias = [c for _, c, _ in FONTES] + [CATEGORIA_NOVIDADES]
    itens = {}  # numero -> [numero, titulo, artista, categoria idx]
    repetidos = []
    descartes = []
    sem_titulo = []

    def adicionar(numero, titulo, artista, cat, idioma):
        titulo = title_case(titulo, idioma) if titulo else ''
        artista = re.sub(r'\s+', ' ', artista.replace('’', "'")).strip()
        if not titulo:
            sem_titulo.append((cat, numero, artista))
            return
        if numero in itens:
            # novidades repetem músicas que já estavam nas listas (com título completo); fica a da lista
            repetidos.append((numero, itens[numero][1], titulo))
            if cat == CATEGORIA_NOVIDADES:
                return
        itens[numero] = [numero, titulo, artista, categorias.index(cat)]

    for arquivo, cat, idioma in FONTES:
        for numero, titulo, artista, _pg in ler_pdf(pasta / f'{arquivo}.pdf', descartes):
            adicionar(numero, titulo, artista, cat, idioma)
        print(f'{cat}: {sum(1 for v in itens.values() if v[3] == categorias.index(cat))}')

    with open(NOVIDADES, encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f, delimiter=';'):
            adicionar(r['numero'].strip(), r['titulo'].strip(), r['artista'].strip(), CATEGORIA_NOVIDADES,
                      'en' if r.get('idioma', '').strip().upper() == 'EUA' else 'pt')
    print(f'{CATEGORIA_NOVIDADES}: {sum(1 for v in itens.values() if v[3] == categorias.index(CATEGORIA_NOVIDADES))}')

    ordenados = sorted(itens.values(), key=lambda v: (v[1].lower(), v[2].lower()))
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps({'categorias': categorias, 'itens': ordenados}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'\n{len(ordenados)} músicas -> {SAIDA.relative_to(RAIZ)}')
    print(f'códigos repetidos (novidades já presentes nas listas ficam como nas listas): {len(repetidos)}')
    for r in repetidos[:15]:
        print('  ', r)
    print(f'linhas sem código (descartadas): {len(descartes)}')
    for d in descartes[:15]:
        print('  ', d)
    print(f'linhas sem título: {len(sem_titulo)}')
    for s in sem_titulo[:15]:
        print('  ', s)


if __name__ == '__main__':
    main()
