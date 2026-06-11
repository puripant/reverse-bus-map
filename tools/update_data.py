#!/usr/bin/env python3
"""Regenerate data/ from the Namtang open data API (OTP, Ministry of Transport).

Source: https://namtang.otp.go.th/opendata (CC-BY 4.0)
GTFS feed: https://namtang-api.otp.go.th/download/namtang-gtfs.zip

Outputs:
  data/stop_list.json   bus stops in greater Bangkok with the route numbers serving them
  data/rail_lines.json  BTS/MRT/SRT/ARL line shapes with official colors

Usage: python3 tools/update_data.py [--gtfs path/to/namtang-gtfs.zip]
"""

import argparse
import csv
import io
import json
import math
import os
import sys
import urllib.request
import zipfile
from collections import defaultdict

GTFS_URL = 'https://namtang-api.otp.go.th/download/namtang-gtfs.zip'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')

# greater Bangkok and surroundings (Nonthaburi, Pathum Thani, Samut Prakan)
LAT_MIN, LAT_MAX = 13.40, 14.10
LON_MIN, LON_MAX = 100.25, 101.00

# route_type: 0 tram/light rail, 1 metro, 2 rail, 3 bus
METRO_TYPES = {'0', '1'}


def in_bbox(lat, lon):
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def read_csv(zf, name):
    with zf.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')))


def split_name(name):
    """Namtang names are 'thai;english'."""
    parts = [p.strip() for p in name.split(';')]
    return parts[0], parts[1] if len(parts) > 1 else ''


def downsample(points, min_dist_deg=0.001):
    """Keep shape points at least ~100m apart to shrink the output."""
    kept = [points[0]]
    for p in points[1:-1]:
        if math.hypot(p[0] - kept[-1][0], p[1] - kept[-1][1]) >= min_dist_deg:
            kept.append(p)
    kept.append(points[-1])
    return kept


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gtfs', help='use a local copy of namtang-gtfs.zip instead of downloading')
    args = parser.parse_args()

    if args.gtfs:
        path = args.gtfs
    else:
        path = '/tmp/namtang-gtfs.zip'
        print(f'downloading {GTFS_URL} ...')
        req = urllib.request.Request(GTFS_URL, headers={'User-Agent': 'reverse-bus-map data updater'})
        with urllib.request.urlopen(req, timeout=300) as r, open(path, 'wb') as out:
            out.write(r.read())

    zf = zipfile.ZipFile(path)
    feed = read_csv(zf, 'feed_info.txt')[0]
    print(f"feed version {feed['feed_version']} by {feed['feed_publisher_name']}")

    routes = {r['route_id']: r for r in read_csv(zf, 'routes.txt')}
    trips = {t['trip_id']: t for t in read_csv(zf, 'trips.txt')}
    stops = {s['stop_id']: s for s in read_csv(zf, 'stops.txt')}

    # stop_id -> set of bus route numbers (route_short_name merges both directions)
    stop_buses = defaultdict(set)
    for st in read_csv(zf, 'stop_times.txt'):
        trip = trips.get(st['trip_id'])
        if not trip:
            continue
        route = routes[trip['route_id']]
        if route['route_type'] == '3':
            stop_buses[st['stop_id']].add(route['route_short_name'].strip())

    stop_list = []
    for stop_id, bus_refs in stop_buses.items():
        s = stops[stop_id]
        lat, lon = float(s['stop_lat']), float(s['stop_lon'])
        if not in_bbox(lat, lon):
            continue
        name_th, name_en = split_name(s['stop_name'])
        stop_list.append({
            'stop_name': name_th,
            'stop_name_en': name_en,
            'latitude': f'{lat:.5f}',
            'longitude': f'{lon:.5f}',
            'id': stop_id,
            'bus_ids': sorted(bus_refs),
        })
    stop_list.sort(key=lambda s: int(s['id']))
    print(f'{len(stop_list)} bus stops in bbox, '
          f'{len(set(b for s in stop_list for b in s["bus_ids"]))} bus routes')

    # rail lines: metro/tram types plus the Airport Rail Link (type 2)
    rail_ids = {rid for rid, r in routes.items() if r['route_type'] in METRO_TYPES}
    rail_ids |= {rid for rid, r in routes.items()
                 if r['route_type'] == '2' and r['route_short_name'] == 'ARL'}

    shapes = defaultdict(list)
    for p in read_csv(zf, 'shapes.txt'):
        shapes[p['shape_id']].append(
            (int(p['shape_pt_sequence']), float(p['shape_pt_lon']), float(p['shape_pt_lat'])))

    # longest shape per route as its representative geometry
    route_shapes = defaultdict(set)
    for t in trips.values():
        if t['route_id'] in rail_ids and t['shape_id']:
            route_shapes[t['route_id']].add(t['shape_id'])

    rail_lines = []
    seen = set()
    for rid in sorted(rail_ids, key=int):
        r = routes[rid]
        name_th, name_en = split_name(r['route_long_name'])
        if (name_th, r['route_color']) in seen:  # same line listed per direction
            continue
        shape_ids = route_shapes.get(rid)
        if not shape_ids:
            continue
        best = max(shape_ids, key=lambda sid: len(shapes[sid]))
        pts = [(lon, lat) for _, lon, lat in sorted(shapes[best])]
        rail_lines.append({
            'name': name_th,
            'name_en': name_en,
            'color': f"#{r['route_color']}" if r['route_color'] else '#999999',
            'coords': [[round(lon, 5), round(lat, 5)] for lon, lat in downsample(pts)],
        })
        seen.add((name_th, r['route_color']))
    print(f'{len(rail_lines)} rail lines')

    with open(os.path.join(DATA_DIR, 'stop_list.json'), 'w', encoding='utf-8') as f:
        json.dump(stop_list, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(DATA_DIR, 'rail_lines.json'), 'w', encoding='utf-8') as f:
        json.dump(rail_lines, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote data/stop_list.json and data/rail_lines.json')


if __name__ == '__main__':
    sys.exit(main())
