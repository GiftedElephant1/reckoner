#!/usr/bin/env python3
"""Chooses the iPhone simulators the cloud build tries the app in.

Reads `xcrun simctl list devices available --json` on standard input and prints one line per
choice: "<udid> <iOS version> <device name>". It picks one iPhone on the newest iOS 18 and one
on the newest iOS after that, so the app is tried on the system it was built for and on a
current one. With nothing suitable it prints nothing.
"""
import json
import re
import sys

PREFERRED = ["iPhone 17", "iPhone 16", "iPhone 15", "iPhone 16e", "iPhone 14"]


def runtime_version(key):
    """'com.apple.CoreSimulator.SimRuntime.iOS-18-5' -> (18, 5); None for other systems."""
    match = re.search(r"SimRuntime\.iOS-(\d+)(?:-(\d+))?(?:-(\d+))?$", key)
    if not match:
        return None
    return tuple(int(part) for part in match.groups() if part is not None)


def best_device(devices):
    phones = [d for d in devices if d.get("isAvailable", True) and d.get("name", "").startswith("iPhone")]
    for name in PREFERRED:
        for device in phones:
            if device["name"] == name:
                return device
    plain = [d for d in phones if "SE" not in d["name"]]
    return (plain or phones or [None])[0]


def choose(listing):
    runtimes = []
    for key, devices in listing.get("devices", {}).items():
        version = runtime_version(key)
        device = best_device(devices) if version else None
        if device:
            runtimes.append((version, device))
    runtimes.sort(key=lambda item: item[0])
    older = [item for item in runtimes if item[0][0] <= 18]
    newer = [item for item in runtimes if item[0][0] > 18]
    picks = []
    if older:
        picks.append(older[-1])
    if newer:
        picks.append(newer[-1])
    return picks


def main():
    listing = json.load(sys.stdin)
    for version, device in choose(listing):
        print("%s %s %s" % (device["udid"], ".".join(str(n) for n in version), device["name"]))


if __name__ == "__main__":
    main()
