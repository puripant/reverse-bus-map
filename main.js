const debug = false;

const files = ['data/stop_list.json', 'data/bangkok.json'];
let promises = [];
files.forEach((url) => {
  promises.push(d3.json(url))
});
let stops;

const desc_stop_name = d3.select('#stop-name');
// const desc_stop_number = d3.select('#stop-number');
const desc_bus_number = d3.select('#bus-number');
const desc_reaches = d3.select('#reaches');

let width = Math.min(1000, window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth);
let height = Math.min(1000, (window.innerHeight|| document.documentElement.clientHeight|| document.body.clientHeight) - 150);
let svg = d3.select('svg')
  .attr('width', width)
  .attr('height', height)
  .append('g');

let transform;
let stop_r = (r) => transform ? r / Math.sqrt(transform.k) : r;

let svg_stops;
let projected_stops;
let voronoi;
let delaunay;
let mousemove = (event) => {
  const [mx, my] = transform.invert(d3.pointer(event));
  const p = delaunay.find(mx, my);
  if (p != -1) {
    show_reaches(p);
  }
}
let show_reaches = (p) => {
  // check if neighbors are within range
  let neighbors = [...voronoi.neighbors(p)];
  let all = [p];
  let stop = projected_stops[p];
  neighbors.forEach((n) => {
    let neighbor = projected_stops[n];
    if (Math.hypot(neighbor[0] - stop[0], neighbor[0] - stop[1]) < 10) { // NOTE distance in screen space (pixels)
      all.push(n);
    }
  });
  if (debug) {
    svg.selectAll('.voronoi')
      .attr('fill', 'none');
    all.forEach((x) => {
      svg.select(`.voronoi-${x}`)
        .attr('fill', '#009');
    });
    svg.select(`.voronoi-${p}`)
      .attr('fill', '#090');
  }

  svg_stops
    .attr('stroke', 'none')
    .attr('fill', '#000')
    .attr('r', stop_r(1));
  
  let bus_ids = new Set();
  let reaches = new Set();
  all.forEach((x) => {
    stops[x].bus_ids.forEach((bus_id) => bus_ids.add(bus_id));

    stops[x].stop_reaches.forEach((stop_id) => {
      reaches.add(stop_id);

      svg.select(`#stop-${stop_id}`)
        .attr('fill', '#E60268')
        .attr('r', stop_r(2));
    });
    svg.select(`#stop-${stops[x].id}`)
      .raise()
      .attr('stroke', '#fff')
      .attr('stroke-width', stop_r(1))
      .attr('fill', '#E60268')
      .attr('r', stop_r(5));
  });

  desc_stop_name.text(stops[all[0]].stop_name);
  // desc_stop_number.text(all.length - 1);
  desc_bus_number.text(bus_ids.size);
  desc_reaches.text(reaches.size);
}

Promise.all(promises).then((data) => {
  stops = data[0];
  let bangkok = data[1];

  let busses = {}
  stops.forEach((stop) => {
    stop.bus_ids.forEach((bus_id) => {
      if (bus_id in busses) {
        busses[bus_id].push(stop.id);
      } else {
        busses[bus_id] = [stop.id];
      }
    });
  });
  stops.forEach((stop, i) => {
    let stop_set = new Set()
    stop.bus_ids.forEach((bus_id) => {
      busses[bus_id].forEach((stop_id) => {
        stop_set.add(stop_id);
      });
    });
    stops[i].stop_reaches = stop_set;
  });

  let projection = d3.geoMercator()
    .fitSize([width, height], bangkok);
  let path = d3.geoPath()
    .projection(projection);

  // bangkok boundary
  svg.selectAll('path')
    .data([bangkok])
    .enter().append('path')
      .attr('fill', '#ccc')
      .attr('d', path);

  projected_stops = stops.map(d => projection([d.longitude, d.latitude]));
  delaunay = d3.Delaunay.from(projected_stops);
  voronoi = delaunay.voronoi([0, 0, width, height]);
  let cells = stops.map((d, i) => [d, voronoi.cellPolygon(i)]);

  // voronoi
  if (debug) {
    cells.forEach((cell, i) => {
      if (cell[1]) {
        svg.append('path')
          .classed(`voronoi`, true)
          .classed(`voronoi-${i}`, true)
          .attr('fill', 'none')
          // .attr('fill', (Math.abs(d3.polygonArea(cell[1])) > 200) ? '#900' : 'none')
          .attr('opacity', 0.1)
          .attr('stroke', 'none')
          .attr('stroke-width', 0.5)
          .attr('d', `M${cell[1].join(' ')}Z`);
      }
    });
    svg.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#eee')
      .attr('stroke-width', 0.5)
      .attr('d', voronoi.render());
  }
  
  // bus stops
  // svg.append('path')
  //   .attr('d', delaunay.renderPoints(null, 1));
  svg_stops = svg.selectAll('.stop')
    .data(stops)
    .enter().append('circle')
      .classed('stop', true)
      .attr('id', (d) => `stop-${d.id}`)
      .attr('fill', '#000')
      .attr('r', stop_r(1))
      // .attr('r', d => Math.sqrt(d.bus_ids.length)/2)
      // .attr('r', d => Math.sqrt(d.stop_reaches.size)/10)
      .attr('transform', (d, i) => `translate(${projected_stops[i][0]},${projected_stops[i][1]})`)
    .on('click', (event) => {
      // TODO pause interaction
    });

  // interaction
  const zoom = d3.zoom().on('zoom', (event) => {
    transform = event.transform;
    svg.attr('transform', transform);
    
    mousemove(event)
  });
  d3.select('svg')
    .call(zoom)
    .call(zoom.transform, d3.zoomIdentity)
    .on('mousemove', mousemove)
    .on('click', (event) => {
      // TODO resume interaction
    });

  // init from a random stop
  show_reaches(d3.randomInt(stops.length)())
});