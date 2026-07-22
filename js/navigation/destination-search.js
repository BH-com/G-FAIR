/* FINDER modular section: search. Load order is defined in admin.html and index.html. */
function getDestinations() { return gridMap ? gridMap.destinations : sampleDestinations; }

function renderResults(queryText) {
  const q = normalize(queryText);
  const matched = getDestinations().filter((item) =>
    [item.name, item.booth, item.category, ...(item.keywords || [])]
      .some((value) => normalize(value).includes(q))
  );
  window.WayfindingRenderers.renderSearchResults(results, matched, selectDestination);
}

function handleBoothMapClick(item) {
  selectDestination(item);
}

function selectDestination(item) {
  selectedDestination = item;
  routeLine.setAttribute("points", "");
  destinationMarker.style.display = "none";
  updateSelectedBoothDisplay(item);

  if (gridMap) {
    renderGridPreservingView();
  }
}
