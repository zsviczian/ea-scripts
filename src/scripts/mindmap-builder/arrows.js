/**
 * @file arrows.js
 * @overview arrows implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createArrows(runtimeContext) {
  const addUpdateArrowLabel = (arrow, text) => {
    if (!arrow) {
      return;
    }
    const maybeTextElement = runtimeContext.ea.getBoundTextElement(arrow, true);
    let textElement = maybeTextElement.eaElement;
    if (!textElement && maybeTextElement.sceneElement) {
      runtimeContext.ea.copyViewElementsToEAforEditing([maybeTextElement.sceneElement]);
      textElement = runtimeContext.ea.getElement(maybeTextElement.sceneElement.id);
    }
    if (textElement) {
      if (!text) {
        textElement.isDeleted = true;
      } else {
        textElement.rawText = text;
        textElement.text = text;
        textElement.originalText = text;
      }
      return;
    }
    if (!text) {
      return;
    }
    const x = arrow.x + arrow.width / 2;
    const y = arrow.y + arrow.height / 2;
    const textId = runtimeContext.ea.addText(x, y, text);
    const textEl = runtimeContext.ea.getElement(textId);
    textEl.strokeColor = arrow.strokeColor;
    textEl.containerId = arrow.id;
    textEl.textAlign = "center";
    textEl.textVerticalAlign = "middle";
    textEl.fontSize = Math.floor(textEl.fontSize / 2);
    arrow.boundElements = [
      {
        type: "text",
        id: textId,
      },
    ];
  };

  const configureArrow = (context) => {
    const {
      arrowId,
      isChildRight,
      isChildBelow,
      startId,
      endId,
      coordinates,
      isRadial,
      layoutDirection,
    } = context;
    const { sX, sY, eX, eY } = coordinates;
    const eaArrow = runtimeContext.ea.getElement(arrowId);
    const isVertical = layoutDirection === "vertical";
    if (isVertical) {
      // Configure Binding Points (using .0001/.9999 to avoid jumping effect)
      // In Radial mode, bind to the center (0.5) of the root node
      const startRatio = isRadial ? 0.50001 : isChildBelow ? 0.9999 : 0.0001;
      const endRatio = isChildBelow ? 0.0001 : 0.9999;
      const centerRatio = 0.5001;
      eaArrow.startBinding = {
        ...eaArrow.startBinding,
        elementId: startId,
        mode: "orbit",
        fixedPoint: [centerRatio, startRatio],
      };
      eaArrow.endBinding = {
        ...eaArrow.endBinding,
        elementId: endId,
        mode: "orbit",
        fixedPoint: [centerRatio, endRatio],
      };
      eaArrow.x = sX;
      eaArrow.y = sY;
      const dx = eX - sX;
      const dy = eY - sY;
      if (runtimeContext.arrowType === "straight") {
        eaArrow.roundness = null;
        eaArrow.points = [
          [0, 0],
          [dx, dy],
        ];
      } else {
        eaArrow.roundness = {
          type: 2,
        };
        if (isRadial) {
          // Swapped coefficients for vertical curve: Y progresses faster than X initially
          eaArrow.points = [
            [0, 0],
            [dx * 0.75, (dy * 2) / 3],
            [dx, dy],
          ];
        } else {
          // Swapped coefficients for vertical curve: Y progresses faster than X initially
          // This ensures lines shoot out vertically first before fanning out horizontally
          eaArrow.points = [
            [0, 0],
            [dx * 0.25, dy / 3],
            [dx * 0.75, (dy * 2) / 3],
            [dx, dy],
          ];
        }
      }
    } else {
      // Standard horizontal logic
      // Configure Binding Points (using .0001/.9999 to avoid jumping effect)
      // In Radial mode, bind to the center (0.5) of the root node
      const startRatio = isRadial ? 0.50001 : isChildRight ? 0.9999 : 0.0001;
      const endRatio = isChildRight ? 0.0001 : 0.9999;
      const centerYRatio = 0.5001;
      eaArrow.startBinding = {
        ...eaArrow.startBinding,
        elementId: startId,
        mode: "orbit",
        fixedPoint: [startRatio, centerYRatio],
      };
      eaArrow.endBinding = {
        ...eaArrow.endBinding,
        elementId: endId,
        mode: "orbit",
        fixedPoint: [endRatio, centerYRatio],
      };
      eaArrow.x = sX;
      eaArrow.y = sY;
      const dx = eX - sX;
      const dy = eY - sY;
      if (runtimeContext.arrowType === "straight") {
        eaArrow.roundness = null;
        eaArrow.points = [
          [0, 0],
          [dx, dy],
        ];
      } else {
        eaArrow.roundness = {
          type: 2,
        };
        if (isRadial) {
          eaArrow.points = [
            [0, 0],
            [(dx * 2) / 3, dy * 0.75],
            [dx, dy],
          ];
        } else {
          // Standard horizontal curve: X progresses faster than Y initially
          eaArrow.points = [
            [0, 0],
            [dx / 3, dy * 0.25],
            [(dx * 2) / 3, dy * 0.75],
            [dx, dy],
          ];
        }
      }
    }
  };

  const updateL1Arrow = (node, context, layoutDirection = "horizontal") => {
    const { rootId, rootCenter, mode } = context;
    const arrow = runtimeContext.ea
      .getElements()
      .find(
        (a) =>
          a.type === "arrow" &&
          a.customData?.isBranch &&
          a.startBinding?.elementId === rootId &&
          a.endBinding?.elementId === node.id,
      );
    if (arrow) {
      const childNode = runtimeContext.ea.getElement(node.id);
      const rootNode = runtimeContext.ea.getElement(rootId);
      if (!childNode || !rootNode) return;
      const isRadial = mode === "Radial";
      if (layoutDirection === "vertical") {
        const childCenterY = childNode.y + childNode.height / 2;
        const isChildBelow = childCenterY > rootCenter.y;
        // In Radial mode, start arrow from the center of the root node
        const sX = rootCenter.x;
        const sY = isRadial
          ? rootCenter.y
          : isChildBelow
            ? rootNode.y + rootNode.height
            : rootNode.y;
        const eX = childNode.x + childNode.width / 2;
        const eY = isChildBelow ? childNode.y : childNode.y + childNode.height;
        configureArrow({
          arrowId: arrow.id,
          isChildBelow,
          startId: rootId,
          endId: node.id,
          coordinates: {
            sX,
            sY,
            eX,
            eY,
          },
          isRadial,
          layoutDirection,
        });
      } else {
        const childCenterX = childNode.x + childNode.width / 2;
        const isChildRight = childCenterX > rootCenter.x;
        // In Radial mode, start arrow from the center of the root node
        const sX = isRadial
          ? rootCenter.x
          : isChildRight
            ? rootNode.x + rootNode.width
            : rootNode.x;
        const sY = rootCenter.y;
        const eX = isChildRight ? childNode.x : childNode.x + childNode.width;
        const eY = childNode.y + childNode.height / 2;
        configureArrow({
          arrowId: arrow.id,
          isChildRight,
          startId: rootId,
          endId: node.id,
          coordinates: {
            sX,
            sY,
            eX,
            eY,
          },
          isRadial,
          layoutDirection,
        });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 6. Map Actions
  // ---------------------------------------------------------------------------
  /**
   * Reconnects an arrow from one element to another.
   * Updates the arrow's binding (start or end) and maintains the boundElements arrays
   * of both the old and new parent nodes to ensure consistency.
   *
   * @param {ExcalidrawElement} currentBindingElement - The node to disconnect from.
   * @param {ExcalidrawElement} newBindingElement - The node to connect to.
   * @param {ExcalidrawElement} arrow - The arrow element to rewire.
   * @param {string} side - "start" or "end". Defaults to "start".
   */
  const reconnectArrow = (currentBindingElement, newBindingElement, arrow, side = "start") => {
    // 1. Ensure all involved elements are in the EA workbench
    const elementsToCheck = [currentBindingElement, newBindingElement, arrow];
    const elementsToCopy = elementsToCheck.filter((el) => !runtimeContext.ea.getElement(el.id));
    if (elementsToCopy.length > 0) {
      runtimeContext.ea.copyViewElementsToEAforEditing(elementsToCopy);
    }
    // 2. Retrieve mutable references from EA
    const oldNode = runtimeContext.ea.getElement(currentBindingElement.id);
    const newNode = runtimeContext.ea.getElement(newBindingElement.id);
    const targetArrow = runtimeContext.ea.getElement(arrow.id);
    // 3. Update the Arrow's binding property
    const bindingKey = side === "start" ? "startBinding" : "endBinding";
    targetArrow[bindingKey] = {
      ...(targetArrow[bindingKey] || {}),
      elementId: newNode.id,
    };
    // 4. Remove arrow reference from the Old Node's boundElements
    if (oldNode.boundElements) {
      oldNode.boundElements = oldNode.boundElements.filter((be) => be.id !== targetArrow.id);
    }
    // 5. Add arrow reference to the New Node's boundElements
    if (!newNode.boundElements) newNode.boundElements = [];
    // Prevent duplicates
    if (!newNode.boundElements.some((be) => be.id === targetArrow.id)) {
      newNode.boundElements.push({
        type: "arrow",
        id: targetArrow.id,
      });
    }
  };
  return { addUpdateArrowLabel, configureArrow, updateL1Arrow, reconnectArrow };
}
