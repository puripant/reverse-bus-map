# Reverse Bus Map เมล์ไปไหนได้บ้าง

A typical bus map application usually focuses on busses or where a bus can go. This map adds a simple twist of finding all bus routes passing through a bus stop (and its neighbors via Voronoi tessellation) instead. It supports zooming and Voronoi hovering for more information, searching by bus number or stop name, and shows a light background of district boundaries and BTS/MRT/SRT/ARL lines.

## Data

Bus stops, bus routes, and rail lines come from the [Namtang open data](https://namtang.otp.go.th/opendata) GTFS feed by the Office of Transport and Traffic Policy and Planning (สนข.), Ministry of Transport, licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). The feed is updated regularly and reflects the 2024–2025 Bangkok bus route reform; route numbers are shown in the new format with the old number in parentheses, e.g. `1-58 (525)`.

To refresh the data from the API:

```sh
python3 tools/update_data.py
```

This downloads the latest GTFS feed and regenerates `data/stop_list.json` (bus stops in greater Bangkok with their routes) and `data/rail_lines.json` (rail line shapes and colors). District boundaries in `data/districts.json` are from Bangkok GIS data and rarely change.

The original data was from a project with Mayday for TEDxBangkok around 2007–2008.
