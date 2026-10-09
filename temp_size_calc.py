import os
from pathlib import Path

node_modules = Path(r'E:\account-android-app\AccountApp\node_modules')
packages = []

for item in sorted(node_modules.iterdir()):
    if item.is_dir():
        try:
            size_bytes = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
            size_mb = size_bytes / (1024 * 1024)
            packages.append((item.name, size_mb))
        except (OSError, PermissionError):
            pass

packages.sort(key=lambda x: x[1], reverse=True)
print(f'{"Package Name":<55} {"Size (MB)":>10}')
print('-' * 67)
for name, size in packages:
    print(f'{name:<55} {size:>10.2f}')

total = sum(s for _,s in packages)
print(f'\nTotal: {total:.2f} MB')
