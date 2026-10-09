import os
import shutil
from pathlib import Path

base = Path(r'E:\account-android-app\AccountApp')
backup_dir = base / 'backup' / 'changes1'
backup_dir.mkdir(parents=True, exist_ok=True)

files = [
    'src/utils/headerTextureTheme.js',
    'src/screens/ThemeSettingsScreen.js',
    'src/components/Header.js',
    'src/navigation/MainTabNavigator.js',
    'src/screens/DashboardScreen.js',
    'src/components/DashboardPeriodFilter.js',
    'src/components/ui/MetricsBar.js',
]

for f in files:
    src = base / Path(f)
    dst = backup_dir / f.replace('/', '_')
    shutil.copy2(str(src), str(dst))
    print(f'Backed up: {f}')

print('All backups done!')
