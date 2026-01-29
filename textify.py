import os

# --- 設定 ---
# 読み込みたい拡張子
TARGET_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.md'}
# 完全に無視するディレクトリ
IGNORE_DIRS = {
    'node_modules', '.next', '.git', 'dist', 'build', 
    'coverage', 'public', 'out', '.vercel'
}
# 完全に無視するファイル
IGNORE_FILES = {'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'pack_project.py'}
# 出力ファイル名
OUTPUT_FILE = "project_context.txt"

def should_ignore(path):
    parts = path.split(os.sep)
    return any(part in IGNORE_DIRS for part in parts) or any(part in IGNORE_FILES for part in parts)

def pack_project():
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f_out:
        for root, dirs, files in os.walk('.'):
            # 不要なディレクトリをスキップ
            if should_ignore(root):
                continue
            
            for file in files:
                if should_ignore(file):
                    continue
                
                ext = os.path.splitext(file)[1]
                if ext in TARGET_EXTENSIONS:
                    file_path = os.path.join(root, file)
                    relative_path = os.path.relpath(file_path, '.')
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f_in:
                            content = f_in.read()
                            
                        f_out.write(f"\n{'='*50}\n")
                        f_out.write(f"FILE: {relative_path}\n")
                        f_out.write(f"{'='*50}\n\n")
                        f_out.write(content)
                        f_out.write("\n")
                        print(f"Added: {relative_path}")
                    except Exception as e:
                        print(f"Skipped: {relative_path} (Error: {e})")

    print(f"\n完了！ {OUTPUT_FILE} に保存されました。")

if __name__ == "__main__":
    pack_project()