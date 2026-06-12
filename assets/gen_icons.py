from PIL import Image, ImageDraw, ImageFont

def make_img(text, size, bg_color, text_color, filename):
    img = Image.new('RGBA', size, color=bg_color)
    d = ImageDraw.Draw(img)
    try:
        fnt = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size[0]//6)
    except:
        fnt = ImageFont.load_default()
        
    text_bbox = d.textbbox((0,0), text, font=fnt)
    w = text_bbox[2] - text_bbox[0]
    h = text_bbox[3] - text_bbox[1]
    
    d.text(((size[0]-w)/2, (size[1]-h)/2), text, font=fnt, fill=text_color)
    img.save(filename)

# Main icon
make_img('KasirQu', (1024, 1024), '#3b82f6', 'white', 'icon.png')
# Splash
make_img('KasirQu', (2048, 2048), '#3b82f6', 'white', 'splash-icon.png')
# Android foreground (transparent)
make_img('KasirQu', (1024, 1024), (255,255,255,0), '#3b82f6', 'android-icon-foreground.png')
print("Icons generated!")
