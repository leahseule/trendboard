import time
from pathlib import Path

# Windows Docker Desktop의 bind mount(grpcfuse)는 mkdir가 성공해도 바로 다음 write가
# 그 디렉터리를 못 찾거나(FileNotFoundError), 이미 있는 디렉터리인데 mkdir 자체가
# FileExistsError를 던지는 등 간헐적으로 일관성이 어긋나는 걸 실제로 겪었다(2026-08-27).
# 파일 하나 저장하는 데 실패해서 500을 내느니, 짧게 몇 번 재시도해서 넘기는 게 낫다.


def write_text_resilient(path: Path, text: str, attempts: int = 5):
    last_err = None
    for i in range(attempts):
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
            return
        except (FileNotFoundError, FileExistsError, OSError) as e:
            last_err = e
            time.sleep(0.05 * (i + 1))
    raise last_err
