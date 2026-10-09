#!/usr/bin/env python3
import struct
import os

file_path = r"android\native new memory-20260405T012351.heapprofd"

# Read file
with open(file_path, 'rb') as f:
    data = f.read()

print(f"File size: {len(data) / (1024*1024):.2f} MB")
print(f"Total bytes: {len(data)}")

# Search for "libRNQuickSQLite" string
search_term = b"libRNQuickSQLite"
if search_term in data:
    pos = data.find(search_term)
    print(f"\n✅ Found '{search_term.decode()}' at offset {pos}")
    print(f"   Context (50 bytes around): {data[max(0, pos-25):pos+75]}")
else:
    print(f"\n❌ String 'libRNQuickSQLite' not found in trace")

# Search for "libsqlite" too
search_term2 = b"libsqlite"
if search_term2 in data:
    pos2 = data.find(search_term2)
    print(f"✅ Found '{search_term2.decode()}' at offset {pos2}")
else:
    print(f"❌ String 'libsqlite' not found")

# Check allocation counts
print("\n--- Checking for allocation events ---")
malloc_count = data.count(b"malloc")
alloc_count = data.count(b"alloc")
print(f"'malloc' occurrences: {malloc_count}")
print(f"'alloc' occurrences: {alloc_count}")

# Look for heap size information
print("\n--- Scanning for numeric patterns ---")
# Protobuf varints for large numbers (memory sizes)
large_numbers = []
for i in range(0, min(len(data)-4, 10000), 4):
    chunk = data[i:i+4]
    val = struct.unpack('<I', chunk)[0]
    if 100000000 < val < 1000000000:  # Between 100MB and 1GB
        large_numbers.append((i, val, val/(1024*1024)))

print(f"Found {len(large_numbers)} potential large memory values (100MB-1GB range):")
for offset, val, mb in large_numbers[:10]:
    print(f"  Offset {offset}: {val} bytes = {mb:.1f} MB")

# File header inspection
print(f"\n--- File header (first 50 bytes, hex) ---")
print(data[:50].hex())
