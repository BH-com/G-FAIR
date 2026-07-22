(() => {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    GRID_MAP: "exhibitionGridMap",
    GRID_MAP_ORIGINAL: "exhibitionGridMapOriginal",
    CUSTOM_START: "exhibitionCustomStart",
    MANAGED_LOCATIONS: "exhibitionManagedLocations",
    IMPORTED_COMPANIES: "exhibitionImportedCompanies",
    BOOTH_LABEL_OVERRIDES: "exhibitionBoothLabelOverrides",
    BOOTH_LIFT_MULTIPLIER: "exhibitionBoothLiftMultiplier",
    CENTERLINE_OVERRIDES: "exhibitionCenterlineOverrides",
    CENTERLINE_DELETED_NODES: "exhibitionCenterlineDeletedNodes",
    CENTERLINE_BYPASSES: "exhibitionCenterlineBypasses",
    CENTERLINE_MERGED_NODES: "exhibitionCenterlineMergedNodes",
    CENTERLINE_CUSTOM_NODES: "exhibitionCenterlineCustomNodes",
    ROUTE_CLOSED_EDGES: "exhibitionRouteClosedEdges",
    ROUTE_DELETED_EDGES: "exhibitionRouteDeletedEdges",
    ROUTE_MANUAL_SEGMENTS: "exhibitionRouteManualSegments",
    JOINT_VECTOR_ROUTE: "exhibitionJointVectorRouteV1",
    EXHIBITION_NAME: "exhibitionName"
  });

  const DEPLOYMENT_STORAGE_KEYS = Object.freeze(Object.values(STORAGE_KEYS));

  window.ExhibitionConfig = Object.freeze({
    STORAGE_KEYS,
    DEPLOYMENT_STORAGE_KEYS,
    DEPLOYMENT_STATE_PATH: "data/deployment-state.json",
    LOCAL_SYNC_CHANNEL_NAME: "exhibitionWayfindingState",
    PROJECT_FORMAT: "exhibition-wayfinding-project",
    PROJECT_VERSION: 1
  });
})();
