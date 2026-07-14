#!/usr/bin/env python3
"""Create SQLite schema matching prisma/schema.prisma, including assigned_school_id."""
import sqlite3
import os

DB_PATH = '/home/z/my-project/db/custom.db'

# Remove old empty DB and SHM
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
shm = DB_PATH + '-shm'
wal = DB_PATH + '-wal'
if os.path.exists(shm):
    os.remove(shm)
if os.path.exists(wal):
    os.remove(wal)

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

c.execute("""
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Viewer',
    status TEXT NOT NULL DEFAULT 'active',
    profile_photo TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT 1,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT 0,
    two_factor_secret TEXT,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until DATETIME,
    last_login DATETIME,
    assigned_school_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (assigned_school_id) REFERENCES schools(id)
)
""")

c.execute("""
CREATE TABLE schools (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    director_name TEXT,
    opening_hours TEXT,
    school_photo TEXT,
    latitude REAL,
    longitude REAL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL
)
""")

c.execute("""
CREATE TABLE students (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    cpf TEXT UNIQUE,
    rg TEXT,
    date_of_birth DATETIME,
    blood_type TEXT,
    special_needs TEXT,
    medications TEXT,
    class TEXT,
    grade TEXT,
    phone TEXT,
    address TEXT,
    guardian_name TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,
    emergency_contact TEXT,
    school_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    photo TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id)
)
""")

c.execute("""
CREATE TABLE participation_badges (
    id TEXT PRIMARY KEY NOT NULL,
    student_id TEXT NOT NULL,
    badge_type TEXT NOT NULL,
    earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE (student_id, badge_type)
)
""")

c.execute("""
CREATE TABLE attendance_records (
    id TEXT PRIMARY KEY NOT NULL,
    student_id TEXT NOT NULL,
    date DATETIME NOT NULL,
    status TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE (student_id, date)
)
""")

c.execute("""
CREATE TABLE action_logs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    ip_address TEXT,
    device TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
""")

c.execute("""
CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
""")

c.execute("""
CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    date DATETIME NOT NULL,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'upcoming',
    created_by TEXT NOT NULL,
    photo_url TEXT,
    school_id TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (school_id) REFERENCES schools(id)
)
""")

c.execute("""
CREATE TABLE event_participants (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    attended BOOLEAN NOT NULL DEFAULT 0,
    notes TEXT,
    added_by TEXT,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (added_by) REFERENCES users(id),
    UNIQUE (event_id, student_id)
)
""")

c.execute("""
CREATE TABLE support_tickets (
    id TEXT PRIMARY KEY NOT NULL,
    protocol TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    user_id TEXT NOT NULL,
    assigned_to TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
)
""")

c.execute("""
CREATE TABLE support_messages (
    id TEXT PRIMARY KEY NOT NULL,
    ticket_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
)
""")

conn.commit()

c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in c.fetchall()]
print(f'Created {len(tables)} tables:')
for t in tables:
    print(f'  - {t}')

c.execute("PRAGMA table_info(users)")
cols = [r[1] for r in c.fetchall()]
print(f'\nusers columns: {cols}')
assert 'assigned_school_id' in cols, 'assigned_school_id missing!'

conn.close()
print('\nOK Schema created successfully with assigned_school_id column')
