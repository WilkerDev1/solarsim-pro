#!/usr/bin/env python3
"""Read a private DB dump from stdin; restore/migrate only a network-isolated copy.
Never persist or print business documents, hashes of passwords, or backup contents.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

if sys.stdin.isatty():
    raise SystemExit('Pipe an authorized private PostgreSQL backup into this rehearsal.')
root = Path(__file__).resolve().parents[2]
private = Path(tempfile.mkdtemp(prefix='solarsim-logical-qa-'))
name = 'solarsim-restore-qa-' + uuid.uuid4().hex[:10]
container_id = None
try:
    socket = private / 'socket'
    socket.mkdir(mode=0o755)
    backup = private / 'input.dump'
    with backup.open('xb') as output:
        os.chmod(backup, 0o600)
        shutil.copyfileobj(sys.stdin.buffer, output)
    with backup.open('rb') as source:
        header = source.read(2048)
    custom = header.startswith(b'PGDMP')
    if not custom and b'PostgreSQL database dump' not in header:
        raise RuntimeError('Unrecognized backup format; no restore attempted.')
    container_id = subprocess.check_output([
        'docker', 'run', '-d', '--name', name, '--network', 'none',
        '--label', 'solarsim.qa=restore', '--memory', '256m',
        '--tmpfs', '/var/lib/postgresql/data', '--mount', f'type=bind,source={socket},target=/var/run/postgresql',
        '-e', 'POSTGRES_USER=solarsim_qa', '-e', 'POSTGRES_DB=solarsim_qa',
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine',
    ], text=True).strip()
    for attempt in range(60):
        if subprocess.run(['docker', 'exec', container_id, 'pg_isready', '-h', '127.0.0.1', '-U', 'solarsim_qa'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(.25)
    else:
        raise RuntimeError('Isolated PostgreSQL did not become ready.')
    if custom:
        args = ['pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-U', 'solarsim_qa', '-d', 'solarsim_qa']
    else:
        subprocess.run(['docker', 'exec', container_id, 'psql', '-U', 'solarsim_qa', '-d', 'solarsim_qa', '-c', 'CREATE ROLE solarsim_user'], check=True, stdout=subprocess.DEVNULL)
        args = ['psql', '--set', 'ON_ERROR_STOP=1', '-U', 'solarsim_qa', '-d', 'solarsim_qa']
    with backup.open('rb') as source:
        restored = subprocess.run(['docker', 'exec', '-i', container_id, *args], stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if restored.returncode:
        # Detailed SQL errors can contain private values. Keep the failure output redacted.
        raise RuntimeError('Restore failed; private SQL diagnostics intentionally not printed.')
    subprocess.run(['node', '--import', 'tsx', 'server/tests/backupRehearsal.ts', str(socket)], cwd=root, check=True)
    subprocess.run(['docker', 'exec', container_id, 'pg_amcheck', '--heapallindexed', '--parent-check', '--install-missing', '-U', 'solarsim_qa', '-d', 'solarsim_qa'], check=True)
    print('PASS: backup restore, migrations 001/002/003 twice, contents/counts/orphans and pg_amcheck. No network, no production writes.')
finally:
    if container_id:
        subprocess.run(['docker', 'rm', '-f', container_id], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shutil.rmtree(private, ignore_errors=True)
