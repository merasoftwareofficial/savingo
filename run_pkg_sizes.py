import os
from pathlib import Path

node_modules = Path(r'E:\account-android-app\AccountApp\node_modules')
output_file = Path(r'E:\sunny.txt')

packages = []

for item in sorted(node_modules.iterdir()):
    if item.is_dir():
        try:
            size_bytes = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
            size_mb = size_bytes / (1024 * 1024)
            size_kb = size_bytes / 1024
            if size_mb >= 1:
                size_str = f"{size_mb:.2f} MB"
            else:
                size_str = f"{size_kb:.1f} KB"
            packages.append((item.name, size_bytes, size_str))
        except (OSError, PermissionError):
            packages.append((item.name, 0, "0 KB"))

packages.sort(key=lambda x: x[1], reverse=True)

lines = []
lines.append("=" * 65)
lines.append("       NODE_MODULES - PACKAGE SIZE REPORT")
lines.append("=" * 65)
lines.append(f"{'Package Name':<50} {'Size':>12}")
lines.append("-" * 65)
for name, size_bytes, size_str in packages:
    lines.append(f"{name:<50} {size_str:>12}")
lines.append("-" * 65)
total_bytes = sum(x[1] for x in packages)
total_mb = total_bytes / (1024*1024)
lines.append(f"{'TOTAL PACKAGES: ' + str(len(packages)):<50} {total_mb:>9.2f} MB")
lines.append("=" * 65)

content = "\n".join(lines)
output_file.write_text(content, encoding='utf-8')
print("SUCCESS - File saved to E:\\sunny.txt")
print(content[:500])
