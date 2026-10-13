/** @file pasteMetadata.js
 * @overview Keeps native paste undo snapshots free of stale Builder element references.
 */

/**
 * Native paste captures its history before onChange. Undo can therefore restore transport
 * tags and pre-duplication IDs. One drawing subscription repairs those snapshots without
 * creating another undo entry. Only ID mappings are retained, never clipboard contents.
 */
export function createPasteMetadataCleanup() {
  const registrations = new Map();
  const dispose = () => {
    registrations.forEach(({ unsubscribe, operations, repair }) => {
      operations.forEach((op) => {
        op.transportActive = false;
      });
      repair();
      unsubscribe();
    });
    registrations.clear();
  };
  const track = (api, marker, operation) => {
    registrations.forEach((registration, oldApi) => {
      if (oldApi.isDestroyed) {
        registration.unsubscribe();
        registrations.delete(oldApi);
      }
    });
    let registration = registrations.get(api);
    if (!registration) {
      registration = { operations: new Map(), unsubscribe: () => {} };
      registrations.set(api, registration);
      registration.repair = () => {
        if (api.isDestroyed) return;
        const elements = api.getSceneElementsIncludingDeleted();
        // Ordinary renders need no array copy or element mutation.
        if (
          !elements.some(
            (e) =>
              e.customData &&
              Object.keys(e.customData).some(
                (key) =>
                  key.startsWith("__mindmapPaste_") &&
                  registration.operations.get(key)?.transportActive !== true,
              ),
          )
        )
          return;
        let changed = false;
        const repaired = elements.map((e) => {
          if (!e.customData) return e;
          let customData;
          for (const key of Object.keys(e.customData)) {
            if (!key.startsWith("__mindmapPaste_")) continue;
            let operation = registration.operations.get(key);
            if (!operation) {
              operation = { transportActive: false, idMap: new Map() };
              registration.operations.set(key, operation);
            }
            if (operation.transportActive) continue;
            customData ??= { ...e.customData };
            delete customData[key];
            if (!operation.idMap.size)
              operation.idMap = new Map(
                api
                  .getSceneElementsIncludingDeleted()
                  .filter((e) => e.customData?.[key])
                  .map((e) => [e.customData[key], e.id]),
              );
            const mapping = operation.idMap;
            for (const ref of ["boundaryId", "foldIndicatorId"]) {
              const oldId = customData[ref];
              if (typeof oldId === "string") {
                if (mapping.has(oldId)) customData[ref] = mapping.get(oldId);
                else if (![...mapping.values()].includes(oldId)) delete customData[ref];
              }
            }
          }
          if (!customData) return e;
          changed = true;
          return ExcalidrawLib.newElementWith(e, { customData });
        });
        if (changed && !api.isDestroyed)
          api.updateScene({ elements: repaired, captureUpdate: "NEVER" });
      };
      registration.unsubscribe = api.onChange(registration.repair);
    }
    if (marker) registration.operations.set(marker, operation);
  };
  const repair = (api) => registrations.get(api)?.repair();
  const watch = (api) => {
    if (!api || api.isDestroyed) return;
    track(api, null, null);
    repair(api);
  };
  return { track, dispose, repair, watch };
}
