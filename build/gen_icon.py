"""生成 app 图标（PNG + macOS .icns）
用法：python3 gen_icon.py
"""
import json, os, subprocess, struct, math
from PIL import Image, ImageDraw

DST = os.path.dirname(os.path.abspath(__file__))

# 颜色：深蓝 + 青绿渐变感
C_BG = (28, 32, 48)
C_ACCENT = (108, 159, 255)
C_GLOW = (80, 200, 200)

def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = size * 0.22  # 圆角
    m = size * 0.08  # 外边距

    # 圆角背景
    draw.rounded_rectangle(
        [m, m, size - m, size - m],
        radius=r,
        fill=C_BG
    )

    # 中心 “API” 文字风格图形：三条横线 + 一个菱形
    cx, cy = size / 2, size / 2
    scale = size / 512

    # 用简单几何替代字体：三个圆角短条 + 一个圆
    bar_w, bar_h = size * 0.38, size * 0.06
    bar_r = bar_h / 2
    gap = size * 0.09
    for i, color in enumerate([C_ACCENT, C_ACCENT, C_GLOW]):
        y = cy - gap + i * gap
        draw.rounded_rectangle(
            [cx - bar_w/2, y - bar_h/2, cx + bar_w/2, y + bar_h/2],
            radius=bar_r,
            fill=color
        )

    # 右下角小菱形（API 中的端点感）
    dot_r = size * 0.04
    dx, dy = cx + bar_w/2 + size * 0.06, cy + gap
    draw.ellipse(
        [dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r],
        fill=C_GLOW
    )

    return img


# ── 主入口 ──────────────────────────────────────
def main():
    # 512 → PNG
    png_path = os.path.join(DST, "icon.png")
    draw_icon(512).save(png_path, "PNG")
    print(f"[OK] {png_path}")

    # macOS: iconset → icns
    iconset = os.path.join(DST, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    sizes = {
        "16x16": 16, "32x32": 32, "128x128": 128,
        "256x256": 256, "512x512": 512,
    }
    for name, sz in sizes.items():
        img = draw_icon(sz)
        img.save(os.path.join(iconset, f"icon_{name}.png"), "PNG")
        # retina 2x
        img_2x = draw_icon(sz * 2)
        img_2x.save(os.path.join(iconset, f"icon_{name}@2x.png"), "PNG")

    subprocess.run(["iconutil", "-c", "icns", iconset], check=True)
    print(f"[OK] {os.path.join(DST, 'icon.icns')}")

    # 也生成一个 256x256 PNG 给 Windows/Linux
    img256 = draw_icon(256)
    img256.save(os.path.join(DST, "icon_256.png"), "PNG")
    print(f"[OK] {os.path.join(DST, 'icon_256.png')}")


if __name__ == "__main__":
    main()
