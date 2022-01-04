const files = ['data/stop_list.json', 'data/bangkok.json'];
let promises = [];
files.forEach((url) => {
  promises.push(d3.json(url))
});

let width = 1000;
let height = 700;
let svg = d3.select('svg')
  .attr('width', width)
  .attr('height', height);

Promise.all(promises).then((data) => {
  let stop_list = data[0];
  let bangkok = data[1];

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

  const projected = stop_list.map(d => projection([d.longitude, d.latitude]));
  let delaunay = d3.Delaunay.from(projected);
  let voronoi = delaunay.voronoi([0, 0, width, height]);
  let cells = stop_list.map((d, i) => [d, voronoi.cellPolygon(i)]);

  // voronoi
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
  
  // bus stops
  svg.append('path')
    .attr('d', delaunay.renderPoints(null, 1));
  // svg.selectAll('.marker')
  //   .data(stop_list)
  //   .enter().append('circle')
  //     .classed('marker', true)
  //     .attr('fill', '#ff0000')
  //     .attr('r', 1)
  //     .attr('transform', (d) => {
  //       let p = projection([d.longitude, d.latitude]);
  //       return `translate(${p[0]},${p[1]})`;
  //     });

  // voronoi interaction
  svg.on("mousemove", (event) => {
    const [mx, my] = d3.pointer(event);
    const p = delaunay.find(mx, my);
    svg.selectAll('.voronoi')
      .attr('fill', 'none');
    svg.select(`.voronoi-${p}`)
      .attr('fill', '#090');

    let neighbors = [...voronoi.neighbors(p)];
    neighbors.forEach((n) => {
      svg.select(`.voronoi-${n}`)
        .attr('fill', '#009');
    });
    // TODO check if neighbors are within range
    // Math.hypot(projected[n][0] - projected[p][0], projected[n][0] - projected[p][1]) < radius
  })
});