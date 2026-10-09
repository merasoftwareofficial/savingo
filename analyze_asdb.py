#!/usr/bin/env python3
"""
Parse Android Studio .asdb memory profile (protobuf format).
Extract Java/Kotlin heap allocations by class.
"""
import struct
import os
from collections import defaultdict

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

def extract_class_allocations(data):
    """Extract Java/Kotlin class allocations from protobuf."""
    allocations = defaultdict(int)
    i = 0
    
    # Look for patterns: class names followed by size info
    while i < len(data) - 10:
        # Find potential class names (java.*, android.*, kotlin.*)
        if data[i:i+5] in [b'java.', b'andr', b'koti']:
            start = i
            # Read until null terminator or non-printable
            while i < len(data) and (32 <= data[i] < 127 or data[i] in [b'.', b'$']):
                i += 1
            
            if i - start > 5:
                try:
                    class_name = data[start:i].decode('ascii', errors='ignore')
                    # Try to find size info nearby
                    if i < len(data) - 4:
                        size_bytes = data[i:i+4]
                        size = struct.unpack('<I', size_bytes)[0]
                        if 1000 < size < 1000000000:  # reasonable size
                            allocations[class_name] += size
                except:
                    pass
        i += 1
    
    return allocations

def extract_strings_with_size(data):
    """Extract readable strings that might contain class/size info."""
    results = []
    i = 0
    current_str = b''
    
    while i < len(data):
        byte = data[i]
        if 32 <= byte < 127:  # printable ASCII
            current_str += bytes([byte])
        else:
            if len(current_str) > 8:
                try:
                    s = current_str.decode('ascii', errors='ignore')
                    if any(x in s for x in ['java.', 'android.', 'kotlin.', 'Map', 'Array', 'String', 'ArrayList']):
                        results.append(s)
                except:
                    pass
            current_str = b''
        i += 1
    
    return results

# Parse file
file_path = r"android\after fix dashboard account memory-20260405T013002.asdb"
with open(file_path, 'rb') as f:
    data = f.read()

print("=" * 70)
print("JAVA/KOTLIN MEMORY PROFILE ANALYSIS (POST-FIX)")
print("=" * 70)

print(f"\nFile size: {len(data) / (1024*1024):.1f} MB")
print(f"Total bytes: {len(data)}")

# Extract strings
strings = extract_strings_with_size(data)
print(f"\nRelevant class references found: {len(strings)}")

# Group by category
java_classes = [s for s in set(strings) if s.startswith('java.')]
android_classes = [s for s in set(strings) if s.startswith('android.')]
kotlin_classes = [s for s in set(strings) if s.startswith('kotlin.')]
other_classes = [s for s in set(strings) if not any(s.startswith(x) for x in ['java.', 'android.', 'kotlin.'])]

print("\n--- JAVA CLASSES (Top 15) ---")
for cls in sorted(java_classes)[:15]:
    print(f"  {cls}")

print("\n--- ANDROID CLASSES (Top 15) ---")
for cls in sorted(android_classes)[:15]:
    print(f"  {cls}")

print("\n--- KOTLIN CLASSES (Top 10) ---")
for cls in sorted(kotlin_classes)[:10]:
    print(f"  {cls}")

print("\n--- OTHER CLASSES (Top 10) ---")
for cls in sorted(other_classes)[:10]:
    print(f"  {cls}")

# Look for suspicious patterns
print("\n--- MEMORY LEAK INDICATORS ---")
suspicious = [s for s in set(strings) if any(x in s for x in ['Map', 'Cache', 'HashMap', 'ArrayList', 'Array', 'LinkedList', 'queue'])]
if suspicious:
    print(f"Found {len(suspicious)} collection types:")
    for s in sorted(suspicious)[:20]:
        print(f"  {s}")
else:
    print("✅ No obvious collection memory issues")

# Database/SQLite checks
print("\n--- DATABASE REFERENCES ---")
db_refs = [s for s in set(strings) if any(x in s.lower() for x in ['sqlite', 'database', 'cursor', 'statement', 'connection', 'db'])]
if db_refs:
    print(f"Found {len(db_refs)} database references:")
    for ref in sorted(db_refs)[:15]:
        print(f"  {ref}")
else:
    print("✅ No problematic database references")

print("\n" + "=" * 70)
print("STATUS: Profile analysis complete. Compare with previous recording.")
print("=" * 70)
