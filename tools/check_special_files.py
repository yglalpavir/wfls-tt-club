"""Check initial-scores.json, seasons.json, settings.json for Japanese name issues."""
import json
import os

files = [
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ms\initial-scores.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ws\initial-scores.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\md\initial-scores.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\wd\initial-scores.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\xd\initial-scores.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ms\event-coefficient.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ws\event-coefficient.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\md\event-coefficient.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\wd\event-coefficient.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\xd\event-coefficient.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ms\seasons.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ws\seasons.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\md\seasons.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\wd\seasons.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\xd\seasons.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ms\settings.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ws\settings.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\md\settings.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\wd\settings.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\xd\settings.json',
    r's:\wfls-tt-club\wfls-tt-club\wtt_data\ms\tleague_player.json',
]

JAPANESE_SURNAMES = [
    'SATO','SUZUKI','TAKAHASHI','TANAKA','ITO','WATANABE','YAMAMOTO',
    'NAKAMURA','KOBAYASHI','KATO','YOSHIDA','YAMADA','SASAKI','YAMAGUCHI',
    'MATSUMOTO','INOUE','KIMURA','HAYASHI','SHIMIZU','SAITO','MORI',
    'IKEDA','HASHIMOTO','ABE','OGURA','ISHIKAWA','MAEDA','FUJITA',
    'OKADA','GOTO','HASEGAWA','MURAKAMI','KONDO','ISHII','UCHIDA',
    'SAKAMOTO','OTA','HARIMOTO','MATSUSHIMA','NIWA','MIZUTANI',
    'HIRANO','FUKUHARA','KISHIKAWA','MATSUDAIRA','OSHIMA','MORIZONO',
    'YOSHIMURA','UEDA','CHIBA','SHINOZUKA','TOGAMI','YOKOI','SHIBATA',
    'HAYATA','KIHARA','MURAMATSU','ODO','NAGASAKI','AKAE','ASO','AOKI',
    'MOTO','FUJII','UDA','YOSHIYAMA','SAKAI','YOKOTANI'
]


def find_names(obj, path=''):
    issues = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_path = f'{path}.{k}' if path else k
            if isinstance(v, str) and ' ' in v.strip():
                parts = v.strip().split()
                for surname in JAPANESE_SURNAMES:
                    if surname in parts:
                        idx = parts.index(surname)
                        if idx == 0:
                            given = ' '.join(parts[1:])
                            issues.append((new_path, v, f'surname first: should be "{given} {surname}"'))
                        elif idx == len(parts) - 1:
                            pass  # Correct format
                        else:
                            issues.append((new_path, v, f'surname in middle position {idx+1}'))
            issues.extend(find_names(v, new_path))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            new_path = f'{path}[{i}]'
            if isinstance(item, str) and ' ' in item.strip():
                parts = item.strip().split()
                for surname in JAPANESE_SURNAMES:
                    if surname in parts:
                        idx = parts.index(surname)
                        if idx == 0:
                            given = ' '.join(parts[1:])
                            issues.append((new_path, item, f'surname first: should be "{given} {surname}"'))
                        elif idx == len(parts) - 1:
                            pass
                        else:
                            issues.append((new_path, item, f'surname in middle'))
            issues.extend(find_names(item, new_path))
    return issues


for fpath in files:
    if not os.path.isfile(fpath):
        print(f'NOT FOUND: {os.path.relpath(fpath, "s:\\wfls-tt-club\\wfls-tt-club")}')
        continue
    
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        rel = os.path.relpath(fpath, 's:\\wfls-tt-club\\wfls-tt-club')
        issues = find_names(data)
        
        if issues:
            print(f'\n📁 {rel} ({len(issues)} issue(s)):')
            for path, val, desc in issues:
                print(f'  [{path}] "{val}" -> {desc}')
        else:
            print(f'✅ {rel} - no issues')
    except json.JSONDecodeError as e:
        print(f'⚠️  {os.path.relpath(fpath, "s:\\wfls-tt-club\\wfls-tt-club")} - JSON error: {e}')
    except Exception as e:
        print(f'⚠️  {os.path.relpath(fpath, "s:\\wfls-tt-club\\wfls-tt-club")} - Error: {e}')
