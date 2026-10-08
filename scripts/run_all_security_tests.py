import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.tests.test_security_matrix import test_runner

def main():
    print("=" * 75)
    print("  SECURE MULTI-MODAL RAG - AUTOMATED SECURITY TEST SUITE (v3.0)")
    print("=" * 75)
    results = test_runner.run_all()
    passed = 0
    failed = 0

    for r in results:
        status_str = "[PASS]" if r["passed"] else "[FAIL]"
        print(f"{status_str:7} {r['test_id']:<16} {r['title']:<38} [{r['category']}]")
        print(f"        -> {r['details']}")
        if r["passed"]:
            passed += 1
        else:
            failed += 1

    print("=" * 75)
    print(f"Summary: Total: {len(results)} | Passed: {passed} | Failed: {failed}")
    if failed == 0:
        print("[SUCCESS] ALL SECURITY & GROUNDING INVARIANTS SATISFIED!")
    else:
        print("[FAILURE] Some security invariants failed.")
    print("=" * 75)

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
