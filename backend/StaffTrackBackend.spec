# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = []

hiddenimports += collect_submodules('app')
hiddenimports += collect_submodules('alembic')
hiddenimports += collect_submodules('uvicorn')
hiddenimports += collect_submodules('sqlalchemy.dialects.sqlite')

# Inclusion explicite des modèles SQLAlchemy
hiddenimports += [
    'app.models',
    'app.models.employee',
    'app.models.attendance',
    'app.models.attendance_correction',
]


a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=[],
    datas=[('alembic.ini', '.'), ('migrations', 'migrations')],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='StaffTrackBackend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='StaffTrackBackend',
)
