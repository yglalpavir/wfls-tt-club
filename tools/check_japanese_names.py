"""
Check Japanese player names in WTT score-log JSON files for incorrect format.
Correct format: "GivenName SURNAME" (e.g., "Tomokazu HARIMOTO")
"""

import json
import os
import re
from collections import defaultdict

# Common Japanese surnames in ALL CAPS (the correct surname format)
JAPANESE_SURNAMES_ALL_CAPS = [
    "SATO", "SUZUKI", "TAKAHASHI", "TANAKA", "ITO", "WATANABE", "YAMAMOTO",
    "NAKAMURA", "KOBAYASHI", "KATO", "YOSHIDA", "YAMADA", "SASAKI", "YAMAGUCHI",
    "MATSUMOTO", "INOUE", "KIMURA", "HAYASHI", "SHIMIZU", "SAITO", "MORI",
    "IKEDA", "HASHIMOTO", "ABE", "OGURA", "ISHIKAWA", "MAEDA", "FUJITA",
    "OKADA", "GOTO", "HASEGAWA", "MURAKAMI", "KONDO", "ISHII", "UCHIDA",
    "SAKAMOTO", "OTA", "HARIMOTO", "MATSUSHIMA", "NIWA", "MIZUTANI",
    "HIRANO", "FUKUHARA", "KISHIKAWA", "MATSUDAIRA", "OSHIMA", "MORIZONO",
    "YOSHIMURA", "UEDA", "CHIBA", "SHINOZUKA", "TOGAMI", "YOKOI", "SHIBATA",
    "HAYATA", "KIHARA", "HASHIMOTO", "MURAMATSU", "ODO", "NAGASAKI",
    "AKAE", "ASO", "AOKI", "MOTO", "FUJII", "UDA", "YOSHIYAMA",
    "SAKAI", "YOKOTANI", "SHINOZUKA"
]

# Also include lowercase/first-cap versions to catch misformatted surnames
JAPANESE_SURNAMES_MIXED_CASE = [s.lower() for s in JAPANESE_SURNAMES_ALL_CAPS]
JAPANESE_SURNAMES_TITLE = [s.capitalize() for s in JAPANESE_SURNAMES_ALL_CAPS]

# Commonly seen Japanese given names (to help identify Japanese players)
JAPANESE_GIVEN_NAMES = [
    "Tomokazu", "Miwa", "Mima", "Miu", "Kokoro", "Satsuki", "Miyuu", "Sakura",
    "Hina", "Kasumi", "Miyu", "Mizuki", "Yuka", "Honoka", "Kyoka",
    "Haruka", "Yui", "Rin", "Moe", "Minami", "Misaki", "Sayaka", "Asuka",
    "Yuna", "Rika", "Airi", "Yuri", "Natsumi", "Chinatsu", "Miyabi",
    "Hitomi", "Miyu", "Miyuu", "Saki", "Ami", "Miyu", "Shion",
    "Yukiya", "Shunsuke", "Koki", "Mizuki", "Sora", "Kazuki", "Ryoichi",
    "Kenta", "Koya", "Takuya", "Takeru", "Hiroto", "Ryusuke", "Maharu",
    "Jun", "Kazuhiro", "Koki", "Yuto", "Ryo", "Shogo", "Yoshihiko",
    "Takashi", "Tomotaka", "Toranosuke", "Jo", "Tsubasa", "Kohei", "Daiki",
    "Yoshinori", "Rei", "Hokuto", "Tomoaki", "Masataka", "Ryota", "Yusuke",
    "Sora", "Kai", "Ryuto", "Kazuma", "Soya", "Rui", "Taimu", "Hikaru",
    "Kanade", "Seiya", "Aoto", "Soshi", "Kakeru", "Takuma", "Kosei",
    "Taiyo", "Seungmin", "Daeseong", "Wonseok", "Sangsu", "Jeonghoon",
    "Anri", "Shiho", "Maki", "Nodoka", "Minami", "Mimi", "Saki",  
    "Shouya", "Hachi", "Yuka", "Serina", "Anna"
]

# Some Japanese names have given names that start lowercase or could be ambiguous
# We'll also look for patterns like "SURNAME Initial." or names with special chars

BASE_DIRS = [
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ms",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ws",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\md",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\wd",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\xd",
]

# For initial-scores.json, event-coefficient.json, seasons.json, settings.json
SPECIAL_FILES = [
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ms\initial-scores.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ms\event-coefficient.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ms\seasons.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ms\settings.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ws\initial-scores.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ws\event-coefficient.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ws\seasons.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\ws\settings.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\md\initial-scores.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\md\event-coefficient.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\md\seasons.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\md\settings.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\wd\initial-scores.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\wd\event-coefficient.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\wd\seasons.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\wd\settings.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\xd\initial-scores.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\xd\event-coefficient.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\xd\seasons.json",
    r"s:\wfls-tt-club\wfls-tt-club\wtt_data\xd\settings.json",
]


def collect_score_log_files():
    """Collect all score-log JSON files from the base directories."""
    files = []
    for base_dir in BASE_DIRS:
        if os.path.isdir(base_dir):
            for fname in os.listdir(base_dir):
                if fname.startswith("score-log") and fname.endswith(".json"):
                    files.append(os.path.join(base_dir, fname))
    # Also add special files
    for sf in SPECIAL_FILES:
        if os.path.isfile(sf):
            files.append(sf)
    return sorted(set(files))


def extract_player_names_from_data(data, filepath):
    """Recursively extract all player name strings from JSON data."""
    names = []
    
    if isinstance(data, dict):
        for key, value in data.items():
            # Check if key is a player-related field
            key_lower = key.lower()
            if any(x in key_lower for x in ['name', 'player', 'winner', 'loser', 'team_a', 'team_b',
                                              'player1', 'player2', 'player_a', 'player_b',
                                              'a_player', 'b_player', 'home_player', 'away_player',
                                              'name_ja', 'name_jp']):
                if isinstance(value, str) and ' ' in value.strip():
                    names.append((key, value))
            # Recurse
            names.extend(extract_player_names_from_data(value, filepath))
    
    elif isinstance(data, list):
        for item in data:
            names.extend(extract_player_names_from_data(item, filepath))
    
    return names


def extract_all_strings(data, path=""):
    """Extract all string values from JSON data along with their paths."""
    results = []
    
    if isinstance(data, dict):
        for key, value in data.items():
            new_path = f"{path}.{key}" if path else key
            if isinstance(value, str) and ' ' in value.strip():
                results.append((new_path, value))
            else:
                results.extend(extract_all_strings(value, new_path))
    
    elif isinstance(data, list):
        for i, item in enumerate(data):
            new_path = f"{path}[{i}]"
            if isinstance(item, str) and ' ' in item.strip():
                results.append((new_path, item))
            else:
                results.extend(extract_all_strings(item, new_path))
    
    return results


def contains_japanese_surname(name):
    """Check if a name string contains a known Japanese surname."""
    name_lower = name.lower()
    for surname in JAPANESE_SURNAMES_ALL_CAPS:
        # Check for the surname in all caps
        if surname in name:
            # Must be a whole word (surrounded by spaces/start/end)
            pattern = r'(?:^|\s)' + re.escape(surname) + r'(?:\s|$)'
            if re.search(pattern, name):
                return surname, "all_caps"
    
    for surname in JAPANESE_SURNAMES_TITLE:
        if surname in name:
            pattern = r'(?:^|\s)' + re.escape(surname) + r'(?:\s|$)'
            if re.search(pattern, name):
                return surname, "title_case"
    
    return None, None


def check_name_format(name, surname, match_type):
    """
    Check if the name is in correct format "GivenName SURNAME".
    Returns (is_correct, description)
    """
    parts = name.strip().split()
    if len(parts) < 2:
        return None, f"Single word name: '{name}'"
    
    if match_type == "all_caps":
        # Surname found in all caps
        # Check if it's in position 2 (last word) - correct format
        if parts[-1] == surname:
            return True, f"CORRECT: '{name}'"
        elif parts[0] == surname:
            return False, f"WRONG (surname first): '{name}' -> should be '{' '.join(parts[1:])} {surname}'"
        else:
            # Surname in middle somewhere unusual
            idx = parts.index(surname) if surname in parts else -1
            if idx > 0:
                return False, f"WRONG (surname in position {idx+1}): '{name}'"
            return None, f"Unknown: '{name}'"
    
    elif match_type == "title_case":
        # Surname found in title case (not all caps) - incorrect format
        # It could be "Givenname Surname" (given name first, but surname not all caps)
        # or "Surname Givenname" (surname first, title case)
        if parts[0] == surname:
            surname_upper = surname.upper()
            return False, f"WRONG (surname first, not all caps): '{name}' -> should be '{' '.join(parts[1:])} {surname_upper}'"
        elif parts[-1] == surname:
            surname_upper = surname.upper()
            return False, f"WRONG (surname not all caps): '{name}' -> should be '{' '.join(parts[:-1])} {surname_upper}'"
        else:
            idx = parts.index(surname) if surname in parts else -1
            if idx >= 0:
                return False, f"WRONG (surname not all caps in position {idx+1}): '{name}' -> surname should be {surname.upper()}"
            return None, f"Unknown title case: '{name}'"
    
    return None, f"Unknown: '{name}'"


def check_for_japanese_names(text, filepath):
    """Check a text string for Japanese names in any format."""
    issues = []
    
    # Strategy: look for any of our known surnames anywhere in the string
    # First check all caps surnames
    for surname in JAPANESE_SURNAMES_ALL_CAPS:
        pattern = r'(?:^|\s|")' + re.escape(surname) + r'(?:\s|$|")'
        if re.search(pattern, text):
            # Found an all-caps surname in the text
            # Extract the surrounding name context
            match = re.search(r'((?:\w+\s+){0,3}' + re.escape(surname) + r'(?:\s+\w+){0,3})', text)
            if match:
                context = match.group(1)
                parts = context.strip().split()
                if len(parts) >= 2:
                    if surname in parts:
                        idx = parts.index(surname)
                        if idx == 0:
                            # Surname is first - likely wrong format
                            given_part = ' '.join(parts[1:])
                            # Check if given part looks like a first name
                            if given_part[0].isupper() or given_part[0].islower():
                                issues.append((filepath, f"WRONG (surname first): '{context}' -> should be '{given_part} {surname}'"))
                        elif idx == len(parts) - 1:
                            # Surname is last - correct format
                            pass  # Correct
                        else:
                            issues.append((filepath, f"WRONG (surname in middle): '{context}'"))
    
    # Check title case surnames (surname not all caps) 
    for surname in JAPANESE_SURNAMES_TITLE:
        pattern = r'(?:^|\s|")' + re.escape(surname) + r'(?:\s|$|")'
        if re.search(pattern, text):
            match = re.search(r'((?:\w+\s+){0,3}' + re.escape(surname) + r'(?:\s+\w+){0,3})', text)
            if match:
                context = match.group(1)
                parts = context.strip().split()
                if len(parts) >= 2:
                    if surname in parts:
                        idx = parts.index(surname)
                        surname_upper = surname.upper()
                        if idx == 0:
                            # "Surname Givenname" - wrong, should be "Givenname SURNAME"
                            given_part = ' '.join(parts[1:])
                            issues.append((filepath, f"WRONG (surname first, not all caps): '{context}' -> should be '{given_part} {surname_upper}'"))
                        elif idx == len(parts) - 1:
                            # "Givenname Surname" - wrong, surname should be all caps
                            given_part = ' '.join(parts[:-1])
                            issues.append((filepath, f"WRONG (surname not all caps): '{context}' -> should be '{given_part} {surname_upper}'"))
                        else:
                            issues.append((filepath, f"WRONG (surname not all caps in middle): '{context}'"))
    
    return issues


def check_json_file(filepath):
    """Check a single JSON file for Japanese name issues."""
    issues = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # First, do a text-based search on the raw content
        issues.extend(check_for_japanese_names(content, filepath))
        
        # Also try JSON parsing for more thorough checking
        try:
            data = json.loads(content)
            all_strings = extract_all_strings(data)
            for path, s in all_strings:
                # Check each string for Japanese surnames
                name_issues = check_for_japanese_names(s, filepath)
                for issue in name_issues:
                    # Add the JSON path for context
                    issues.append((filepath, f"[{path}] {issue[1]}"))
        except json.JSONDecodeError:
            pass
            
    except Exception as e:
        issues.append((filepath, f"ERROR: {e}"))
    
    return issues


def main():
    files = collect_score_log_files()
    
    print(f"Checking {len(files)} files for Japanese name format issues...")
    print()
    
    all_issues = defaultdict(list)
    
    for filepath in files:
        issues = check_json_file(filepath)
        for fpath, issue_desc in issues:
            all_issues[fpath].append(issue_desc)
    
    # De-duplicate issues (text search + json parse may find same issue)
    for fpath in all_issues:
        all_issues[fpath] = list(dict.fromkeys(all_issues[fpath]))
    
    total_issues = sum(len(v) for v in all_issues.values())
    
    if total_issues == 0:
        print("✅ No Japanese name format issues found!")
        return
    
    # Also count by unique name pattern across all files
    from collections import Counter
    name_counter = Counter()
    
    for fpath in sorted(all_issues.keys()):
        for issue in all_issues[fpath]:
            # Extract the original name string from the issue description
            # Pattern: 'WRONG ...: 'ORIGINAL_NAME' -> should be 'CORRECT_NAME'
            match = re.search(r"'([^']+)' -> should be '([^']+)'", issue)
            if match:
                orig = match.group(1)
                corrected = match.group(2)
                name_counter[(orig, corrected)] += 1
            else:
                match2 = re.search(r": '([^']+)'", issue)
                if match2:
                    name_counter[(match2.group(1), "")] += 1
    
    print(f"\n{'='*80}")
    print(f"SUMMARY: {total_issues} total issue(s) across {len(all_issues)} file(s)")
    print(f"{'='*80}")
    print()
    
    # Print summary by unique name pattern
    print("UNIQUE NAME PATTERNS FOUND (sorted by frequency):")
    print("-" * 60)
    for (orig, corrected), count in sorted(name_counter.items(), key=lambda x: -x[1]):
        if corrected:
            print(f"  [{count:4d}x] '{orig}' -> should be '{corrected}'")
        else:
            print(f"  [{count:4d}x] '{orig}'")
    
    print()
    print("=" * 80)
    print()
    
    # Print detailed per-file breakdown
    print("DETAILED BREAKDOWN BY FILE:")
    print("=" * 80)
    
    for fpath in sorted(all_issues.keys()):
        issues = all_issues[fpath]
        rel_path = os.path.relpath(fpath, r"s:\wfls-tt-club\wfls-tt-club")
        
        # Count unique name patterns in this file
        file_counter = Counter()
        for issue in issues:
            match = re.search(r"'([^']+)' -> should be '([^']+)'", issue)
            if match:
                file_counter[(match.group(1), match.group(2))] += 1
            else:
                match2 = re.search(r": '([^']+)'", issue)
                if match2:
                    file_counter[(match2.group(1), "")] += 1
        
        print(f"\n📁 {rel_path} ({len(issues)} issue(s), {len(file_counter)} unique patterns):")
        print("-" * 60)
        
        # Show each unique pattern with count and one example line with JSON path
        pattern_shown = set()
        for issue in issues:
            match = re.search(r"\[([^\]]+)\]", issue)
            json_path = match.group(1) if match else "(top-level)"
            
            # Extract just the name pattern
            name_match = re.search(r"'([^']+)' -> should be '([^']+)'", issue)
            if name_match:
                key = (name_match.group(1), name_match.group(2))
            else:
                name_match2 = re.search(r": '([^']+)'", issue)
                key = (name_match2.group(1), "") if name_match2 else ("unknown", "")
            
            if key not in pattern_shown:
                pattern_shown.add(key)
                cnt = file_counter[key]
                if key[1]:
                    print(f"  [{cnt:3d}x] '{key[0]}' -> '{key[1]}'")
                    print(f"         Example path: [{json_path}]")
                else:
                    print(f"  [{cnt:3d}x] '{key[0]}'")
    
    print()
    print("=" * 80)
    print(f"Total: {total_issues} issue(s) across {len(all_issues)} file(s)")


if __name__ == '__main__':
    main()
