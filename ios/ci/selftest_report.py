#!/usr/bin/env python3
"""Turns the app's self-test results into a short Markdown report for the build summary.

    python3 selftest_report.py RESULTS_DIR

RESULTS_DIR holds one selftest-<label>.json per simulator (written by the app when it is
launched with -selftest). Exits with status 1 when a check failed or no result was produced.
"""
import glob
import json
import os
import sys


def load(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as problem:
        return {"passed": 0, "failed": 1, "failures": ["the result file could not be read: %s" % problem]}


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    files = sorted(glob.glob(os.path.join(folder, "selftest-*.json")))
    print("## Reckoner in the iPhone simulator")
    print()
    if not files:
        print("No self-test result was produced, so the app may not have started. Check the screenshots attached to this run.")
        return 1
    bad = 0
    print("| Simulator | Checks passed | Failed |")
    print("|---|---|---|")
    results = []
    for path in files:
        label = os.path.basename(path)[len("selftest-"):-len(".json")].replace("_", " ")
        result = load(path)
        results.append((label, result))
        bad += int(result.get("failed", 0) or 0)
        print("| %s | %s | %s |" % (label, result.get("passed", 0), result.get("failed", 0)))
    print()
    for label, result in results:
        info = result.get("info") or {}
        details = []
        if result.get("systemVersion"):
            details.append("iOS %s" % result["systemVersion"])
        for key, title in (("screen", "screen"), ("safeTop", "top inset"), ("safeBottom", "bottom inset"), ("keySize", "key size"), ("rowsVisible", "rows visible"), ("engine", "engine checks")):
            if key in info:
                details.append("%s %s" % (title, info[key]))
        if "stateFileBytes" in result:
            details.append("saved file %s bytes" % result["stateFileBytes"])
        if result.get("shownBy"):
            details.append("page shown by %s" % result["shownBy"])
        if result.get("readyAfter") is not None:
            details.append("ready %s s after the page began to load" % result["readyAfter"])
        print("**%s**: %s" % (label, ", ".join(details) if details else "no details"))
        for failure in (result.get("failures") or [])[:30]:
            print("- FAILED: %s" % str(failure).replace("\n", " "))
        print()
    print("Screenshots are in the *simulator-check* download attached to this run.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
