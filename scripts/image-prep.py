# Приведение картинок статьи к медиа-стандарту сайта (см. playbook-publish в базе знаний).
#
#   python scripts/image-prep.py <папка статьи> [ещё папки...]
#
# Что делает с каждым файлом img-*.png / img-*.jpg / cover.*:
#   - ужимает до 1000 px по длинной стороне (меньше не трогает);
#   - переводит в палитру 256 цветов и пересохраняет PNG с оптимизацией;
#   - расширение приводит к .png (формат сайта по умолчанию).
# Ссылки в index.mdx на переименованные файлы обновляются здесь же.
#
# Зачем палитра: скриншоты интерфейса Revit и так жмутся хорошо (240-4000 цветов),
# а рекламная графика с градиентами и тенями держит десятки тысяч цветов и без
# квантования весит по 500-700 КБ на картинку.
import os
import sys
from PIL import Image

MAX_SIDE = 1000
COLORS = 256


def prep(path):
    name, ext = os.path.splitext(os.path.basename(path))
    im = Image.open(path).convert('RGB')
    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = os.path.join(os.path.dirname(path), name + '.png')
    im.convert('P', palette=Image.Palette.ADAPTIVE, colors=COLORS).save(out, optimize=True)
    if out != path:
        os.remove(path)
    return out, ext.lower(), os.path.getsize(out)


def main(dirs):
    for d in dirs:
        mdx = os.path.join(d, 'index.mdx')
        text = open(mdx, encoding='utf-8').read() if os.path.exists(mdx) else None
        total = 0
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                continue
            if not (f.startswith('img-') or f.startswith('cover')):
                continue
            out, old_ext, size = prep(os.path.join(d, f))
            total += size
            if text is not None and old_ext != '.png':
                text = text.replace('./' + f, './' + os.path.basename(out))
            print(f'  {f:>14} -> {os.path.basename(out):<14} {size // 1024:>4} КБ')
        if text is not None:
            open(mdx, 'w', encoding='utf-8', newline='').write(text)
        print(f'{d}: {round(total / 1048576, 2)} МБ')


if __name__ == '__main__':
    main(sys.argv[1:])
