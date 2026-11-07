import os
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1920
HEIGHT = 1080

# Cores Padrão TGCode Cyber-Glass
BG_DARK = (10, 12, 18, 255)
CYAN = (0, 240, 255)
GOLD = (234, 179, 8)
PURPLE = (168, 85, 247)
GREEN = (34, 197, 94)
ROSE = (244, 63, 94)
BLUE = (59, 130, 246)
TEXT_WHITE = (248, 250, 252)
TEXT_MUTED = (148, 163, 184)
TEXT_DIM = (100, 116, 139)

try:
    font_header = ImageFont.truetype("arialbd.ttf", 26)
    font_title = ImageFont.truetype("arialbd.ttf", 22)
    font_sub = ImageFont.truetype("arial.ttf", 16)
    font_body = ImageFont.truetype("arial.ttf", 14)
    font_tag = ImageFont.truetype("arialbd.ttf", 12)
    font_pill = ImageFont.truetype("arialbd.ttf", 11)
except:
    font_header = font_title = font_sub = font_body = font_tag = font_pill = ImageFont.load_default()

def draw_top_nav(draw, current_page, color_theme):
    draw.rectangle([0, 0, WIDTH, 75], fill=(13, 16, 25, 250))
    draw.line([(0, 75), (WIDTH, 75)], fill=(35, 45, 65, 255), width=1)
    
    # Logo & Badge
    draw.text((60, 24), "ANIRIUM", fill=color_theme, font=font_header)
    draw.rounded_rectangle([190, 22, 340, 52], radius=6, fill=(22, 28, 42), outline=color_theme, width=1)
    draw.text((205, 29), current_page.upper(), fill=TEXT_WHITE, font=font_pill)
    
    # Navegação entre Páginas Canônicas
    pages = [
        ("1. UNIVERSO", current_page == "universe", GOLD),
        ("2. ARCO", current_page == "arc", GREEN),
        ("3. OBRA (ANIME)", current_page == "work_anime", CYAN),
        ("4. OBRA (MANGÁ)", current_page == "work_manga", PURPLE),
        ("5. EPISÓDIO", current_page == "episode", BLUE),
        ("6. AUTOR / ESTÚDIO", current_page == "creator", ROSE)
    ]
    px = 380
    for label, is_active, col in pages:
        bg = (30, 40, 60) if is_active else (15, 20, 30)
        border = col if is_active else (35, 45, 65)
        txt_col = TEXT_WHITE if is_active else TEXT_DIM
        draw.rounded_rectangle([px, 22, px + 150, 52], radius=6, fill=bg, outline=border, width=1)
        draw.text((px + 14, 29), label, fill=txt_col, font=font_pill)
        px += 165
        
    # Language Selector
    draw.rounded_rectangle([1650, 22, 1860, 52], radius=6, fill=(20, 26, 40), outline=(45, 55, 80), width=1)
    draw.text((1665, 29), "PT · EN · JA · ES · FR · DE", fill=TEXT_MUTED, font=font_pill)

# -------------------------------------------------------------
# 1. PÁGINA DO UNIVERSO (universe_id)
# -------------------------------------------------------------
def generate_universe_page():
    img = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 18, 255))
    draw = ImageDraw.Draw(img)
    draw_top_nav(draw, "universe", GOLD)
    
    # Hero do Universo
    draw.rounded_rectangle([60, 105, 1860, 280], radius=14, fill=(18, 23, 35, 230), outline=GOLD, width=2)
    draw.text((90, 130), "MACROCOSMO CANÔNICO // UNIVERSE_ID", fill=GOLD, font=font_tag)
    draw.text((90, 160), "Universo Dragon Ball", fill=TEXT_WHITE, font=ImageFont.truetype("arialbd.ttf", 36))
    draw.text((90, 215), "Criador Raiz Mestre: Akira Toriyama  ·  Origem Temporal: 1984  ·  38 Obras Vinculadas  ·  14 Arcos Oficiais", fill=TEXT_MUTED, font=font_sub)
    draw.text((90, 245), "O macrocosmo compreende o continuum narrativo do mangá canônico original, suas adaptações e ramificações oficiais.", fill=TEXT_DIM, font=font_body)
    
    # Coluna Esquerda: Obras Raízes & Mangás Originais (40% largura)
    draw.rounded_rectangle([60, 310, 930, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((90, 335), "1. LITERATURA DE ORIGEM (MANGÁS & NOVELS)", fill=PURPLE, font=font_title)
    draw.line([(90, 375), (900, 375)], fill=(35, 45, 65), width=1)
    
    mangas = [
        ("Dragon Ball (Mangá Original)", "1984 - 1995 · 42 Vols · 519 Caps", "Fonte Canônica Raiz (Axioma)", PURPLE),
        ("Dragon Ball Super (Mangá)", "2015 - Presente · 23 Vols · 104 Caps", "Continuação Supervisionada", PURPLE),
        ("Jaco the Galactic Patrolman", "2013 · 1 Vol (Prequel Canônica)", "Spin-off Canônico do Autor", GREEN),
        ("Dragon Ball: Episode of Bardock", "2011 · 1 Vol (Gaiden Especial)", "Spin-off Licenciado", ROSE),
    ]
    my = 395
    for title, meta, role, badge_col in mangas:
        draw.rounded_rectangle([90, my, 900, my + 130], radius=10, fill=(22, 28, 42), outline=(45, 55, 80), width=1)
        draw.text((115, my + 18), title, fill=TEXT_WHITE, font=font_title)
        draw.text((115, my + 52), meta, fill=TEXT_MUTED, font=font_body)
        draw.rounded_rectangle([115, my + 82, 380, my + 110], radius=4, fill=(30, 40, 60), outline=badge_col, width=1)
        draw.text((125, my + 88), role, fill=TEXT_WHITE, font=font_pill)
        my += 150

    # Coluna Direita: Adaptações em Animação & Linhas do Tempo (60% largura)
    draw.rounded_rectangle([960, 310, 1860, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((990, 335), "2. ADAPTAÇÕES AUDIOVISUAIS & DERIVAÇÕES (ANIMES)", fill=CYAN, font=font_title)
    draw.line([(990, 375), (1830, 375)], fill=(35, 45, 65), width=1)
    
    animes = [
        ("Dragon Ball (TV)", "153 Eps · Toei Animation", "Adaptação Canônica Direta (Fase 1)", CYAN),
        ("Dragon Ball Z (TV)", "291 Eps · Toei Animation", "Adaptação Canônica Direta (Fase 2)", CYAN),
        ("Dragon Ball Super (TV + Filmes)", "131 Eps + Broly + Super Hero", "Adaptação de Continuação Canônica", CYAN),
        ("Dragon Ball GT (TV)", "64 Eps · Toei Original", "Linha Temporal Alternativa (Não-Cânon)", ROSE),
        ("Super Dragon Ball Heroes", "56 Eps Promocionais", "Série Promocional / Crossover", GOLD),
    ]
    ay = 395
    for title, meta, role, badge_col in animes:
        draw.rounded_rectangle([990, ay, 1830, ay + 105], radius=10, fill=(22, 28, 42), outline=(45, 55, 80), width=1)
        draw.text((1015, ay + 16), title, fill=TEXT_WHITE, font=font_title)
        draw.text((1015, ay + 48), meta, fill=TEXT_MUTED, font=font_body)
        draw.rounded_rectangle([1015, ay + 72, 1340, ay + 96], radius=4, fill=(30, 40, 60), outline=badge_col, width=1)
        draw.text((1025, ay + 77), role, fill=TEXT_WHITE, font=font_pill)
        ay += 120
        
    return img

# -------------------------------------------------------------
# 2. PÁGINA DO ARCO (arc_id)
# -------------------------------------------------------------
def generate_arc_page():
    img = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 18, 255))
    draw = ImageDraw.Draw(img)
    draw_top_nav(draw, "arc", GREEN)
    
    # Header do Arco
    draw.rounded_rectangle([60, 105, 1860, 300], radius=14, fill=(18, 23, 35, 230), outline=GREEN, width=2)
    draw.text((90, 130), "SAGA / ARCO NARRATIVO // ARC_ID", fill=GREEN, font=font_tag)
    draw.text((90, 160), "Saga dos Saiyajins (Saiyan Arc)", fill=TEXT_WHITE, font=ImageFont.truetype("arialbd.ttf", 36))
    draw.text((90, 215), "Universo: Dragon Ball  ·  Classificação: 100% Cânon Oficial  ·  Ordem Cronológica: Saga 01 (Era Z)", fill=TEXT_MUTED, font=font_sub)
    
    # Métricas de Correspondência Canônica (Ponte Mangá <-> Anime)
    draw.rounded_rectangle([90, 250, 480, 380], radius=8, fill=(25, 34, 52), outline=PURPLE, width=1)
    draw.text((110, 265), "NO MANGÁ ORIGINAL", fill=PURPLE, font=font_tag)
    draw.text((110, 290), "Capítulo 195 ao 241", fill=TEXT_WHITE, font=font_title)
    draw.text((110, 325), "Volume 17 ao Volume 21", fill=TEXT_MUTED, font=font_body)
    
    draw.rounded_rectangle([510, 250, 900, 380], radius=8, fill=(25, 34, 52), outline=CYAN, width=1)
    draw.text((530, 265), "NO ANIME ADAPTADO", fill=CYAN, font=font_tag)
    draw.text((530, 290), "Episódio 001 ao 035", fill=TEXT_WHITE, font=font_title)
    draw.text((530, 325), "Temporada 1 de Dragon Ball Z", fill=TEXT_MUTED, font=font_body)

    draw.rounded_rectangle([930, 250, 1350, 380], radius=8, fill=(25, 34, 52), outline=GOLD, width=1)
    draw.text((950, 265), "FECHAMENTO / CLÍMAX", fill=GOLD, font=font_tag)
    draw.text((950, 290), "Batalha da Terra", fill=TEXT_WHITE, font=font_title)
    draw.text((950, 325), "Recuo de Vegeta no Pod", fill=TEXT_MUTED, font=font_body)

    draw.rounded_rectangle([1380, 250, 1830, 380], radius=8, fill=(25, 34, 52), outline=GREEN, width=1)
    draw.text((1400, 265), "PRÓXIMA SAGA RELACIONAL", fill=GREEN, font=font_tag)
    draw.text((1400, 290), "Saga de Namekusei", fill=TEXT_WHITE, font=font_title)
    draw.text((1400, 325), "Cap. 242+ / Ep. 036+", fill=TEXT_MUTED, font=font_body)

    # Lista de Episódios Mapeados deste Arco
    draw.rounded_rectangle([60, 420, 1860, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((90, 445), "EPISÓDIOS CANÔNICOS E CAPÍTULOS DESTE ARCO", fill=TEXT_WHITE, font=font_title)
    draw.line([(90, 485), (1830, 485)], fill=(35, 45, 65), width=1)

    ep_samples = [
        ("Ep. 001", "O Inimigo Misterioso", "Cap. 195 (Págs 1-15)", "100% Canônico", GREEN),
        ("Ep. 002", "O Segredo de Goku: Ele Tem um Irmão!", "Cap. 196 ao 197", "100% Canônico", GREEN),
        ("Ep. 009", "Desculpe, Sr. Robô! Lágrimas no Deserto", "Sem correspondência", "Filler (Anime Original)", ROSE),
        ("Ep. 010", "Não Chore, Gohan! Seu Primeiro Combate", "Cap. 206 (Cenas mistas)", "Misto (Canônico + Filler)", GOLD),
        ("Ep. 030", "Goku vs. Vegeta! O Confronto Decisivo", "Cap. 228 ao 231", "100% Canônico (Clímax)", GREEN),
    ]
    ey = 505
    for num, title, chaps, status, badge_col in ep_samples:
        draw.rounded_rectangle([90, ey, 1830, ey + 80], radius=8, fill=(22, 28, 42), outline=(45, 55, 80), width=1)
        draw.text((115, ey + 18), num, fill=CYAN, font=font_title)
        draw.text((230, ey + 18), title, fill=TEXT_WHITE, font=font_title)
        draw.text((230, ey + 50), f"Âncora no Mangá: {chaps}", fill=TEXT_MUTED, font=font_body)
        
        draw.rounded_rectangle([1550, ey + 24, 1800, ey + 56], radius=4, fill=(30, 40, 60), outline=badge_col, width=1)
        draw.text((1565, ey + 32), status, fill=TEXT_WHITE, font=font_pill)
        ey += 95

    return img

# -------------------------------------------------------------
# 3. PÁGINA DA OBRA ANIME (work_id: anime)
# -------------------------------------------------------------
def generate_work_anime_page():
    img = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 18, 255))
    draw = ImageDraw.Draw(img)
    draw_top_nav(draw, "work_anime", CYAN)
    
    # Coluna Esquerda: Poster + Detalhes Técnicos (30% largura)
    draw.rounded_rectangle([60, 105, 520, 1030], radius=14, fill=(16, 20, 30, 240), outline=CYAN, width=1)
    
    # Poster Placeholder
    draw.rounded_rectangle([90, 135, 490, 680], radius=10, fill=(25, 34, 52), outline=CYAN, width=2)
    draw.text((210, 380), "[ POSTER ]\n100% Responsive", fill=TEXT_MUTED, font=font_title)
    
    draw.text((90, 710), "METADADOS DE PRODUÇÃO", fill=CYAN, font=font_tag)
    tech_info = [
        ("Formato:", "Série de TV"),
        ("Episódios:", "291 Lançados"),
        ("Exibição:", "1989 - 1996"),
        ("Estúdio:", "Toei Animation"),
        ("Diretor Geral:", "Daisuke Nishio"),
        ("Fonte:", "Mangá Original")
    ]
    ty = 740
    for l, v in tech_info:
        draw.text((90, ty), l, fill=TEXT_DIM, font=font_body)
        draw.text((220, ty), v, fill=TEXT_WHITE, font=font_body)
        ty += 28

    # Coluna Direita: Conexões Genealógicas & Navegação de Arcos
    draw.rounded_rectangle([550, 105, 1860, 330], radius=14, fill=(18, 23, 35, 230), outline=(40, 50, 75), width=1)
    draw.text((580, 130), "OBRA AUDIOVISUAL // WORK_ID", fill=CYAN, font=font_tag)
    draw.text((580, 155), "Dragon Ball Z (ドラゴンボールZ)", fill=TEXT_WHITE, font=ImageFont.truetype("arialbd.ttf", 34))
    draw.text((580, 205), "Universo Dragon Ball  ·  Adaptação Oficial do Mangá de Akira Toriyama  ·  Status: COMPLETED", fill=TEXT_MUTED, font=font_sub)
    draw.text((580, 235), "Cinco anos após o casamento de Goku, a chegada de seu irmão guerreiro extraterrestre revela sua verdadeira herança Saiyajin.", fill=TEXT_DIM, font=font_body)
    
    # Botão de Ação / Conexão com Mangá
    draw.rounded_rectangle([580, 275, 920, 315], radius=6, fill=(40, 30, 70), outline=PURPLE, width=1)
    draw.text((600, 287), "📖 VER MANGÁ ORIGINAL DE ORIGEM", fill=TEXT_WHITE, font=font_pill)

    draw.rounded_rectangle([940, 275, 1260, 315], radius=6, fill=(20, 45, 55), outline=CYAN, width=1)
    draw.text((960, 287), "▶ ABRIR NO PLAYER PRO (+ADDONS)", fill=TEXT_WHITE, font=font_pill)

    # Linha dos Arcos Narrativos desta Obra
    draw.rounded_rectangle([550, 355, 1860, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((580, 380), "ARCOS NARRATIVOS COBERTOS POR ESTA OBRA", fill=TEXT_WHITE, font=font_title)
    draw.line([(580, 420), (1830, 420)], fill=(35, 45, 65), width=1)

    arcs_data = [
        ("Saga dos Saiyajins", "Eps 001 - 035", "Capítulos 195 - 241 do Mangá", "100% Cânon", GREEN),
        ("Saga de Namekusei & Freeza", "Eps 036 - 107", "Capítulos 242 - 329 do Mangá", "100% Cânon", GREEN),
        ("Saga de Garlic Jr.", "Eps 108 - 117", "Sem correspondência no mangá", "Filler da Toei", ROSE),
        ("Saga dos Androides & Cell", "Eps 118 - 199", "Capítulos 330 - 420 do Mangá", "100% Cânon", GREEN),
        ("Torneio do Outro Mundo", "Eps 200 - 209", "Sem correspondência no mangá", "Filler da Toei", ROSE),
        ("Saga de Majin Boo", "Eps 210 - 291", "Capítulos 421 - 519 do Mangá (Final)", "100% Cânon", GREEN)
    ]
    axy = 440
    for aname, aeps, amanga, astatus, acol in arcs_data:
        draw.rounded_rectangle([580, axy, 1830, axy + 85], radius=8, fill=(22, 28, 42), outline=(45, 55, 80), width=1)
        draw.text((605, axy + 16), aname, fill=TEXT_WHITE, font=font_title)
        draw.text((605, axy + 48), f"Anime: {aeps}   |   {amanga}", fill=TEXT_MUTED, font=font_body)
        draw.rounded_rectangle([1620, axy + 26, 1800, axy + 58], radius=4, fill=(30, 40, 60), outline=acol, width=1)
        draw.text((1640, axy + 34), astatus, fill=TEXT_WHITE, font=font_pill)
        axy += 96

    return img

# -------------------------------------------------------------
# 4. PÁGINA DO EPISÓDIO (episode_id)
# -------------------------------------------------------------
def generate_episode_page():
    img = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 18, 255))
    draw = ImageDraw.Draw(img)
    draw_top_nav(draw, "episode", BLUE)
    
    # Frame do Player Pro Superior (Player em Casca Branca)
    draw.rounded_rectangle([60, 105, 1300, 780], radius=14, fill=(5, 7, 12), outline=BLUE, width=2)
    draw.text((540, 420), "[ REPRODUÇÃO DO EPISÓDIO // PLAYER PRO ]\nDesacoplado via Addon Client Local (127.0.0.1:3398)", fill=TEXT_DIM, font=font_title)
    
    # Controles do Player e Canonicidade
    draw.rounded_rectangle([60, 800, 1300, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((90, 825), "EPISÓDIO 01: O INIMIGO MISTERIOSO", fill=TEXT_WHITE, font=ImageFont.truetype("arialbd.ttf", 28))
    draw.text((90, 868), "Dragon Ball Z  ·  Temporada 1  ·  Exibição Original: 26 de Abril de 1989", fill=TEXT_MUTED, font=font_sub)
    
    draw.rounded_rectangle([90, 905, 340, 940], radius=4, fill=(20, 45, 30), outline=GREEN, width=1)
    draw.text((105, 915), "✓ ADAPTAÇÃO CANÔNICA OFICIAL", fill=TEXT_WHITE, font=font_pill)

    draw.rounded_rectangle([360, 905, 680, 940], radius=4, fill=(35, 25, 55), outline=PURPLE, width=1)
    draw.text((375, 915), "📖 MANGÁ: CAPÍTULO 195 (PÁGINAS 1-15)", fill=TEXT_WHITE, font=font_pill)
    
    draw.text((90, 965), "Sinopse: Um misterioso guerreiro Saiyajin chamado Raditz pousa na Terra procurando por Kakarotto, descobrindo que ele cresceu sob o nome de Goku.", fill=TEXT_DIM, font=font_body)

    # Coluna Direita: Âncora no Mangá & Linha de Episódios
    draw.rounded_rectangle([1330, 105, 1860, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((1360, 130), "ÂNCORA DO MATERIAL DE ORIGEM", fill=PURPLE, font=font_title)
    draw.line([(1360, 165), (1830, 165)], fill=(35, 45, 65), width=1)

    # Card da Página do Mangá Correspondente
    draw.rounded_rectangle([1360, 185, 1830, 430], radius=10, fill=(22, 28, 42), outline=PURPLE, width=1)
    draw.text((1385, 205), "Capítulo 195: O Guerreiro Misterioso", fill=TEXT_WHITE, font=font_title)
    draw.text((1385, 235), "Obra: Mangá Dragon Ball (Volume 17)", fill=TEXT_MUTED, font=font_body)
    draw.text((1385, 260), "Autor: Akira Toriyama", fill=TEXT_DIM, font=font_body)
    draw.text((1385, 290), "Status: 100% Canônico", fill=GREEN, font=font_pill)
    draw.rounded_rectangle([1385, 340, 1805, 395], radius=6, fill=(35, 25, 55), outline=PURPLE, width=1)
    draw.text((1440, 360), "LER CAPÍTULO NO LEITOR OFICIAL", fill=TEXT_WHITE, font=font_pill)

    # Próximos Episódios do Arco
    draw.text((1360, 465), "EPISÓDIOS DO ARCO (SAIYAJINS)", fill=TEXT_WHITE, font=font_title)
    draw.line([(1360, 500), (1830, 500)], fill=(35, 45, 65), width=1)

    next_eps = [
        ("Ep. 02", "O Segredo de Goku: Ele Tem um Irmão!", "Cap. 196-197"),
        ("Ep. 03", "A Luta Decisiva! O Ataque de Goku e Piccolo", "Cap. 198-200"),
        ("Ep. 04", "O Plano Secreto de Piccolo! O Sacrifício", "Cap. 201-203"),
        ("Ep. 05", "Goku no Outro Mundo! O Caminho da Serpente", "Cap. 204-205"),
        ("Ep. 06", "Enma Daioh Também se Surpreende!", "Cap. 205-206"),
    ]
    ny = 520
    for en, et, ec in next_eps:
        draw.rounded_rectangle([1360, ny, 1830, ny + 85], radius=8, fill=(20, 25, 38), outline=(40, 50, 75), width=1)
        draw.text((1380, ny + 16), en, fill=BLUE, font=font_title)
        draw.text((1450, ny + 16), et[:30] + "...", fill=TEXT_WHITE, font=font_body)
        draw.text((1450, ny + 46), f"Adaptação: {ec}", fill=TEXT_DIM, font=font_pill)
        ny += 98

    return img

# -------------------------------------------------------------
# 5. PÁGINA DO CRIADOR / ESTÚDIO (person_id & organization_id)
# -------------------------------------------------------------
def generate_creator_page():
    img = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 18, 255))
    draw = ImageDraw.Draw(img)
    draw_top_nav(draw, "creator", ROSE)
    
    # Hero do Criador
    draw.rounded_rectangle([60, 105, 1860, 310], radius=14, fill=(18, 23, 35, 230), outline=ROSE, width=2)
    draw.text((90, 130), "AUTOR & CRIADOR ORIGINAL // PERSON_ID", fill=ROSE, font=font_tag)
    draw.text((90, 160), "Akira Toriyama (鳥山 明)", fill=TEXT_WHITE, font=ImageFont.truetype("arialbd.ttf", 36))
    draw.text((90, 215), "Origem: Japão (Nagoya)  ·  Papel Mestre: Autor Original, Ilustrador, Roteirista e Character Designer", fill=TEXT_MUTED, font=font_sub)
    draw.text((90, 245), "Criador seminal da obra Dragon Ball, Dr. Slump, Sand Land e designer lendário da franquia Dragon Quest.", fill=TEXT_DIM, font=font_body)

    # Coluna Esquerda: Universos Criados por Ele
    draw.rounded_rectangle([60, 340, 930, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((90, 365), "UNIVERSOS SOB AUTORIA RAIZ", fill=GOLD, font=font_title)
    draw.line([(90, 405), (900, 405)], fill=(35, 45, 65), width=1)

    univs = [
        ("Universo Dragon Ball", "38 Obras Vinculadas  ·  1984 - Presente", "Macrocosmo Raiz", GOLD),
        ("Universo Dr. Slump", "18 Obras Vinculadas  ·  1980 - 1984", "Macrocosmo Raiz", GOLD),
        ("Universo Sand Land", "4 Obras Vinculadas  ·  2000 - 2024", "Macrocosmo Raiz", GOLD),
        ("Universo Cowa!", "1 Volume Canônico  ·  1997", "História Única", GOLD),
    ]
    uy = 425
    for ut, um, ur, uc in univs:
        draw.rounded_rectangle([90, uy, 900, uy + 125], radius=10, fill=(22, 28, 42), outline=(45, 55, 80), width=1)
        draw.text((115, uy + 18), ut, fill=TEXT_WHITE, font=font_title)
        draw.text((115, uy + 50), um, fill=TEXT_MUTED, font=font_body)
        draw.rounded_rectangle([115, uy + 80, 280, uy + 108], radius=4, fill=(30, 40, 60), outline=uc, width=1)
        draw.text((125, uy + 86), ur, fill=TEXT_WHITE, font=font_pill)
        uy += 145

    # Coluna Direita: Obras Produzidas e Ilustradas
    draw.rounded_rectangle([960, 340, 1860, 1030], radius=14, fill=(16, 20, 30, 240), outline=(40, 50, 75), width=1)
    draw.text((990, 365), "CATÁLOGO DE OBRAS CADASTRADAS", fill=CYAN, font=font_title)
    draw.line([(990, 405), (1830, 405)], fill=(35, 45, 65), width=1)

    c_works = [
        ("Dragon Ball (Mangá)", "42 Volumes · Shueisha", "Autor & Ilustrador"),
        ("Dr. Slump (Mangá)", "18 Volumes · Shueisha", "Autor & Ilustrador"),
        ("Chrono Trigger (Game / OVA)", "Design de Personagens · Square", "Lead Character Designer"),
        ("Dragon Quest (Série de Jogos & Anime)", "Design de Monstros & Heróis", "Character Designer Oficial"),
        ("Sand Land (Mangá + Anime 2024)", "1 Vol + Série de TV", "Autor Original & Supervisor"),
    ]
    cwy = 425
    for wt, wm, wr in c_works:
        draw.rounded_rectangle([990, cwy, 1830, cwy + 100], radius=10, fill=(22, 28, 42), outline=(45, 55, 80), width=1)
        draw.text((1015, cwy + 16), wt, fill=TEXT_WHITE, font=font_title)
        draw.text((1015, cwy + 48), wm, fill=TEXT_MUTED, font=font_body)
        draw.rounded_rectangle([1015, cwy + 70, 1260, cwy + 92], radius=4, fill=(25, 35, 50), outline=ROSE, width=1)
        draw.text((1025, cwy + 74), wr, fill=TEXT_WHITE, font=font_pill)
        cwy += 115

    return img

# Gera as 5 imagens
output_dir = "C:/Users/santo/Documents/Anirium-App/public/images/designs"
os.makedirs(output_dir, exist_ok=True)

pages = [
    ("page-universe.png", generate_universe_page()),
    ("page-arc.png", generate_arc_page()),
    ("page-work-anime.png", generate_work_anime_page()),
    ("page-episode.png", generate_episode_page()),
    ("page-creator.png", generate_creator_page()),
]

for filename, im in pages:
    target = os.path.join(output_dir, filename)
    im.save(target, "PNG")
    print(f"Gerado: {target}")

print("Todas as 5 páginas canônicas foram desenhadas e geradas com sucesso!")
