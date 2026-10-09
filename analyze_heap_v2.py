#!/usr/bin/env python3
"""
Parse perfetto heapprofd trace to extract allocation hotspots.
"""
import struct
import sys

def read_varint(data, offset):
    """Read protobuf varint."""
    result = 0
    shift = 0
    while offset < len(data):
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7f) << shift
        if not (byte & 0x80):
            break
        shift += 7
    return result, offset

def parse_strings_from_proto(data):
    """Extract all strings from protobuf (naive but effective)."""
    strings = []
    i = 0
    while i < len(data):
        # Look for length-delimited fields (tag=2 indicates string field)
        if i < len(data) - 2:
            try:
                # Try to decode as ASCII string if reasonable length
                if data[i] >= 32 and data[i] < 127:  # printable ASCII
                    start = i
                    while i < len(data) and (data[i] >= 32 and data[i] < 127 or data[i] == 0):
                        i += 1
                    if i - start > 4:  # minimum string length
                        try:
                            s = data[start:i].decode('ascii', errors='ignore').strip('\x00')
                            if len(s) > 3 and s not in strings:
                                strings.append(s)
                        except:
                            pass
                else:
                    i += 1
            except:
                i += 1
        else:
            i += 1
    return strings

# Parse file
file_path = r"android\native new memory-20260405T012351.heapprofd"
with open(file_path, 'rb') as f:
    data = f.read()

print("=" * 60)
print("HEAPPROFD ANALYSIS")
print("=" * 60)

# Extract strings (libraries, functions)
strings = parse_strings_from_proto(data)
relevant_strings = [s for s in strings if any(x in s.lower() for x in ['libr', 'sql', 'malloc', 'heap', 'map', 'cache'])]

print(f"\nFile size: {len(data) / (1024*1024):.1f} MB")
print(f"Total strings extracted: {len(strings)}")

print("\n--- RELEVANT LIBRARY REFERENCES ---")
lib_refs = [s for s in strings if s.startswith('lib') and '.so' in s]
for lib in sorted(set(lib_refs))[:15]:
    print(f"  {lib}")

print("\n--- ALLOCATION REFERENCES ---")
alloc_refs = [s for s in relevant_strings if any(x in s.lower() for x in ['malloc', 'alloc', 'new', 'map', 'cache'])]
for ref in sorted(set(alloc_refs))[:20]:
    print(f"  {ref}")

# Check specific libraries
print("\n--- SQLITE STATUS ---")
if any('sql' in s.lower() for s in strings):
    print("✅ SQLite references found in trace")
    sql_strings = [s for s in strings if 'sql' in s.lower()]
    for s in sql_strings[:5]:
        print(f"   {s}")
else:
    print("❌ No SQLite references")

print("\n--- PREVIOUS vs NEW COMPARISON ---")
print("Previous recording: libRNQuickSQLite = 430MB+")
print("New recording size: 13.3 MB total trace file")
print("\nNote: Trace file ≠ heap size. Need to extract allocation totals from protobuf.")
print("Rough indication: If trace file much smaller + fewer SQL refs = likely fixed ✓")

print("\n" + "=" * 60)
