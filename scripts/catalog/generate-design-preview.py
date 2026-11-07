import os
from PIL import Image, ImageDraw, ImageFont

# Canvas dimensions (16:9 Cinema 1920x1080)
WIDTH = 1920
HEIGHT = 1080

img = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 18, 255))
draw = ImageDraw.Draw(img)

# Cores do Sistema Anirium / Cyber-Glass TGCode
BG_DARK = (10, 12, 18)
CARD_BG = (18, 22, 34, 230)
CARD_BORDER = (40, 50, 75, 255)
CYAN_ACCENT = (0, 240, 255)
PURPLE_ACCENT = (168, 85, 247)
GOLD_ACCENT = (234, 179, 8)
GREEN_ACCENT = (34, 197, 94)
TEXT_WHITE = (248, 250, 252)
TEXT_MUTED = (148, 163, 184)
TEXT_DIM = (100, 116, 139)

# Grid de Fundo Sutil
for x in range(0, WIDTH, 60):
    draw.line([(x, 0), (x, HEIGHT)], fill=(20, 26, 40, 60), width=1)
for y in range(0, HEIGHT, 60):
    draw.line([(0, y), (WIDTH, y)], fill=(20, 26, 40, 60), width=1)

# Glow central (Gradiente radial simples)
for r in range(400, 50, -30):
    alpha = int((1 - r / 400) * 45)
    draw.ellipse([960 - r, 540 - r, 960 + r, 540 + r], fill=(0, 240, 255, alpha))

# Carrega fontes padrão
try:
    font_title = ImageFont.truetype("arial.ttf", 32)
    font_subtitle = ImageFont.truetype("arial.ttf", 20)
    font_card_title = ImageFont.truetype("arialbd.ttf", 22)
    font_body = ImageFont.truetype("arial.ttf", 16)
    font_tag = ImageFont.truetype("arialbd.ttf", 13)
    font_hub = ImageFont.truetype("arialbd.ttf", 28)
except:
    font_title = font_subtitle = font_card_title = font_body = font_tag = font_hub = ImageFont.load_default()

# 1. TOP BAR (Navegação & Breadcrumbs)
draw.rectangle([0, 0, WIDTH, 70], fill=(13, 16, 25, 240))
draw.line([(0, 70), (WIDTH, 70)], fill=(35, 45, 65, 255), width=1)

# Logo & Breadcrumbs
draw.text((60, 22), "ANIRIUM // ENTITY GRAPH EXPLORER", fill=CYAN_ACCENT, font=font_subtitle)
draw.text((500, 24), "Universe: Dragon Ball  >  Arc: Saiyan Saga  >  Work: Dragon Ball Z  >  Episode: 01", fill=TEXT_MUTED, font=font_body)

# Seletor de Idioma no Topo Direito
flags = [("PT", (34, 197, 94)), ("EN", (59, 130, 246)), ("JA", (239, 68, 68)), ("ES", (234, 179, 8))]
fx = 1600
for tag, color in flags:
    draw.rounded_rectangle([fx, 18, fx + 50, 52], radius=6, fill=(25, 32, 48), outline=color, width=1)
    draw.text((fx + 14, 26), tag, fill=TEXT_WHITE, font=font_tag)
    fx += 65

# Helper para desenhar caixas conectadas com cantos arredondados
def draw_node_card(x, y, w, h, title, category, badge, color_accent, details):
    # Aura / Glow
    draw.rounded_rectangle([x - 2, y - 2, x + w + 2, y + h + 2], radius=14, outline=color_accent, width=2)
    draw.rounded_rectangle([x, y, x + w, y + h], radius=12, fill=(18, 23, 35, 240))
    
    # Header do Card
    draw.text((x + 20, y + 16), category.upper(), fill=color_accent, font=font_tag)
    draw.rounded_rectangle([x + w - 90, y + 14, x + w - 16, y + 36], radius=4, fill=(30, 40, 60), outline=color_accent, width=1)
    draw.text((x + w - 82, y + 18), badge, fill=TEXT_WHITE, font=font_tag)
    
    draw.text((x + 20, y + 42), title, fill=TEXT_WHITE, font=font_card_title)
    draw.line([(x + 20, y + 78), (x + w - 20, y + 78)], fill=(35, 45, 65), width=1)
    
    # Detalhes / Linhas
    ly = y + 90
    for label, val in details:
        draw.text((x + 20, ly), label, fill=TEXT_DIM, font=font_body)
        draw.text((x + 120, ly), val, fill=TEXT_MUTED, font=font_body)
        ly += 26

# Linhas de conexão relacional entre nós
def draw_connection(x1, y1, x2, y2, color, label=""):
    # Linha curva de circuito
    mid_x = (x1 + x2) // 2
    draw.line([(x1, y1), (mid_x, y1)], fill=color, width=2)
    draw.line([(mid_x, y1), (mid_x, y2)], fill=color, width=2)
    draw.line([(mid_x, y2), (x2, y2)], fill=color, width=2)
    # Pulso/ponto
    draw.ellipse([x1 - 4, y1 - 4, x1 + 4, y1 + 4], fill=color)
    draw.ellipse([x2 - 4, y2 - 4, x2 + 4, y2 + 4], fill=color)
    if label:
        draw.rounded_rectangle([mid_x - 50, ((y1 + y2) // 2) - 12, mid_x + 50, ((y1 + y2) // 2) + 12], radius=4, fill=(12, 16, 26), outline=color, width=1)
        draw.text((mid_x - 42, ((y1 + y2) // 2) - 8), label, fill=TEXT_WHITE, font=font_tag)

# 2. NÓ CENTRAL ATIVO (O Ponto Focal: Obra Ativa / Anime)
HUB_X = 760
HUB_Y = 400
HUB_W = 400
HUB_H = 280

draw.rounded_rectangle([HUB_X - 4, HUB_Y - 4, HUB_X + HUB_W + 4, HUB_Y + HUB_H + 4], radius=18, outline=CYAN_ACCENT, width=3)
draw.rounded_rectangle([HUB_X, HUB_Y, HUB_X + HUB_W, HUB_Y + HUB_H], radius=16, fill=(15, 22, 38, 255))
draw.text((HUB_X + 24, HUB_Y + 20), "ENTIDADE FOCAL ATIVA", fill=CYAN_ACCENT, font=font_tag)
draw.text((HUB_X + 24, HUB_Y + 48), "Dragon Ball Z", fill=TEXT_WHITE, font=font_hub)
draw.text((HUB_X + 24, HUB_Y + 86), "work_id: 0075b452-f54e-441c-...", fill=TEXT_DIM, font=font_body)
draw.line([(HUB_X + 24, HUB_Y + 115), (HUB_X + HUB_W - 24, HUB_Y + 115)], fill=(35, 45, 65), width=1)

hub_details = [
    ("Formato:", "Série de TV (Anime)"),
    ("Ano / Status:", "1989 · COMPLETED"),
    ("Episódios:", "291 Episódios Oficiais"),
    ("Estúdio:", "Toei Animation"),
    ("Canonicidade:", "Adaptação Canônica Direta")
]
hy = HUB_Y + 130
for l, v in hub_details:
    draw.text((HUB_X + 24, hy), l, fill=TEXT_DIM, font=font_body)
    draw.text((HUB_X + 150, hy), v, fill=TEXT_WHITE, font=font_body)
    hy += 26

# 3. NÓ SUPERIOR: O UNIVERSO CANÔNICO (Parent Macrocosm)
UNIV_X = 760
UNIV_Y = 120
UNIV_W = 400
UNIV_H = 190
draw_node_card(
    UNIV_X, UNIV_Y, UNIV_W, UNIV_H,
    "Universo Dragon Ball",
    "Macrocosmo Canônico",
    "UNIVERSE",
    GOLD_ACCENT,
    [
        ("Autor Raiz:", "Akira Toriyama"),
        ("Obras Totais:", "38 Obras Vinculadas"),
        ("Arcos Totais:", "14 Sagas Canônicas")
    ]
)
draw_connection(HUB_X + HUB_W // 2, HUB_Y, UNIV_X + UNIV_W // 2, UNIV_Y + UNIV_H, GOLD_ACCENT, "Pertence a")

# 4. NÓ ESQUERDO: MATERIAL ORIGINAL DE REFERÊNCIA (Source Manga)
SRC_X = 140
SRC_Y = 400
SRC_W = 420
SRC_H = 280
draw_node_card(
    SRC_X, SRC_Y, SRC_W, SRC_H,
    "Dragon Ball (Mangá Original)",
    "Obra Fonte de Referência",
    "MANGA",
    PURPLE_ACCENT,
    [
        ("Autor & Arte:", "Akira Toriyama"),
        ("Volumes:", "42 Volumes (519 Caps)"),
        ("Publicação:", "Weekly Shonen Jump"),
        ("Papel Canônico:", "Fonte Original Raiz (Axioma)")
    ]
)
draw_connection(SRC_X + SRC_W, SRC_Y + SRC_H // 2, HUB_X, HUB_Y + HUB_H // 2, PURPLE_ACCENT, "Adaptação Oficial")

# 5. NÓ DIREITO: O ARCO NARRATIVO ATIVO (Current Arc)
ARC_X = 1360
ARC_Y = 400
ARC_W = 420
ARC_H = 280
draw_node_card(
    ARC_X, ARC_Y, ARC_W, ARC_H,
    "Saga dos Saiyajins",
    "Arco Narrativo Canônico",
    "ARC_ID",
    GREEN_ACCENT,
    [
        ("Classificação:", "100% Cânon Oficial"),
        ("Capítulos Mangá:", "Capítulo 195 ao 241"),
        ("Episódios Anime:", "Episódio 001 ao 035"),
        ("Próxima Saga:", "Saga de Namekusei (Freeza)")
    ]
)
draw_connection(HUB_X + HUB_W, HUB_Y + HUB_H // 2, ARC_X, ARC_Y + ARC_H // 2, GREEN_ACCENT, "Arco Ativo")

# 6. NÓ INFERIOR: SUB-ESTRUTURAS (Temporadas & Episódios Conectados)
BOT_Y = 790

# Box 1: Temporada
draw_node_card(
    280, BOT_Y, 380, 220,
    "Temporada 1 (Saiyans)",
    "Sub-divisão de Obra",
    "SEASON",
    CYAN_ACCENT,
    [
        ("Total Eps:", "35 Episódios"),
        ("Período:", "1989 - 1990"),
        ("Fechamento:", "Derrota de Vegeta na Terra")
    ]
)
draw_connection(HUB_X + 80, HUB_Y + HUB_H, 470, BOT_Y, CYAN_ACCENT, "Composto por")

# Box 2: Episódio Específico (Âncora de Playback & Capítulos)
draw_node_card(
    760, BOT_Y, 400, 220,
    "Ep. 01: O Inimigo Misterioso",
    "Unidade de Transmissão",
    "EPISODE",
    (56, 189, 248),
    [
        ("Badge:", "Adaptação Canônica Direta"),
        ("Âncora Mangá:", "Capítulo 195 (Págs 1-15)"),
        ("Personagens:", "Goku, Gohan, Raditz, Piccolo"),
        ("Áudio/Legendas:", "Japonês, Português, Espanhol")
    ]
)
draw_connection(HUB_X + HUB_W // 2, HUB_Y + HUB_H, 960, BOT_Y, (56, 189, 248), "Episódio")

# Box 3: Obras Derivadas / Spin-offs (Alternate / Parallel)
draw_node_card(
    1260, BOT_Y, 380, 220,
    "Dragon Ball GT",
    "Universo Compartilhado",
    "SPIN-OFF",
    (244, 63, 94),
    [
        ("Status Canônico:", "Spin-off / Anime Original"),
        ("Autor Original:", "Supervisão de Design"),
        ("Relação:", "Linha Temporal Alternativa"),
        ("Parent:", "Derivado de Dragon Ball Z")
    ]
)
draw_connection(HUB_X + HUB_W - 80, HUB_Y + HUB_H, 1450, BOT_Y, (244, 63, 94), "Linha Paralela")

# Salva imagem renderizada
output_path = os.path.abspath("public/images/entity-graph-design.png")
os.makedirs(os.path.dirname(output_path), exist_ok=True)
img.save(output_path, "PNG")
print(f"Design gerado com sucesso em: {output_path}")
