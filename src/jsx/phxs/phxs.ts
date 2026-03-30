import { Order } from "../../shared/shared";

const DPI = 300;
const BORDER_TOP_MM = 2;
const BORDER_BOTTOM_MM = 2;
const BORDER_LEFT_MM = 10; // Slightly increased for visibility
const BORDER_RIGHT_MM = 1.5;

const mmToPx = (mm: number, dpi: number) => {
  return Math.round((mm / 25.4) * dpi);
};

const createA4Document = (pageNum: number, dpi: number) => {
  const widthA4 = mmToPx(210, dpi);
  const heightA4 = mmToPx(297, dpi);
  //@ts-ignore
  return app.documents.add(
    widthA4,
    heightA4,
    dpi,
    `Page ${pageNum} - Batch`,
    //@ts-ignore
    NewDocumentMode.RGB,
    //@ts-ignore
    DocumentFill.WHITE
  );
};

export const generateBatch = (orders: Order[]) => {
  //@ts-ignore
  const originalRulerUnits = app.preferences.rulerUnits;
  //@ts-ignore
  app.preferences.rulerUnits = Units.PIXELS;

  try {
    let pageNum = 1;
    let doc = createA4Document(pageNum, DPI);
    let currentY = mmToPx(10, DPI);
    const margin_px = mmToPx(5, DPI);
    const maxPerPage = 3;
    let successfullyPlaced = 0;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];

      if (successfullyPlaced > 0 && successfullyPlaced % maxPerPage === 0) {
        pageNum++;
        doc = createA4Document(pageNum, DPI);
        currentY = mmToPx(10, DPI);
        successfullyPlaced = 0;
      }

      const totalH_mm = order.width_mm + BORDER_TOP_MM + BORDER_BOTTOM_MM;
      const totalH_px = mmToPx(totalH_mm, DPI);

      const placedLayer = placeOrderDesign(doc, order, currentY, DPI);
      if (placedLayer) {
        successfullyPlaced++;
        currentY += Math.round(totalH_px + margin_px);
      }
    }
  } catch (e) {
    alert("Generation Error: " + e);
  } finally {
    //@ts-ignore
    app.preferences.rulerUnits = originalRulerUnits;
  }
};

export const printAllDocuments = (closeAfter: boolean) => {
  //@ts-ignore
  const originalDialogs = app.displayDialogs;
  //@ts-ignore
  app.displayDialogs = DialogModes.NO;

  try {
    //@ts-ignore
    const docs = app.documents;
    const docsToPrint: any[] = [];

    for (let i = 0; i < docs.length; i++) {
      if (docs[i].name.indexOf("Batch") !== -1) {
        docsToPrint.push(docs[i]);
      }
    }

    if (docsToPrint.length === 0) {
      alert("No 'Batch' documents found to print.");
      return;
    }

    for (let j = 0; j < docsToPrint.length; j++) {
      const doc = docsToPrint[j];
      //@ts-ignore
      app.activeDocument = doc;
      doc.printOneCopy();
      if (closeAfter) {
        //@ts-ignore
        doc.close(SaveOptions.DONOTSAVECHANGES);
      }
    }
  } catch (e) {
    alert("Printing Error: " + e);
  } finally {
    //@ts-ignore
    app.displayDialogs = originalDialogs;
  }
};

const placeOrderDesign = (doc: any, order: Order, yOffset: number, dpi: number) => {
  try {
    //@ts-ignore
    const file = new File(order.imagePath);
    if (!file.exists) return null;

    //@ts-ignore
    const designDoc = app.open(file);
    designDoc.flatten();
    //@ts-ignore
    const designLayer = designDoc.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    //@ts-ignore
    designDoc.close(SaveOptions.DONOTSAVECHANGES);

    doc.activeLayer = designLayer;

    const artW_px = mmToPx(order.length_mm, dpi);
    const artH_px = mmToPx(order.width_mm, dpi);

    const origW = Number(designLayer.bounds[2]) - Number(designLayer.bounds[0]);
    const origH = Number(designLayer.bounds[3]) - Number(designLayer.bounds[1]);

    // Auto-rotate if image is portrait
    if (origH > origW) {
      //@ts-ignore
      designLayer.rotate(90, AnchorPosition.MIDDLECENTER);
    }

    const preScaleW = Number(designLayer.bounds[2]) - Number(designLayer.bounds[0]);
    const preScaleH = Number(designLayer.bounds[3]) - Number(designLayer.bounds[1]);

    //@ts-ignore
    designLayer.resize((artW_px / preScaleW) * 100, (artH_px / preScaleH) * 100, AnchorPosition.TOPLEFT);

    const totalW_px = artW_px + mmToPx(BORDER_LEFT_MM + BORDER_RIGHT_MM, dpi);
    const xStart = (Number(doc.width) - totalW_px) / 2;
    const xArtworkStart = xStart + mmToPx(BORDER_LEFT_MM, dpi);
    const yArtworkStart = yOffset + mmToPx(BORDER_TOP_MM, dpi);

    designLayer.translate(
      Math.round(xArtworkStart - Number(designLayer.bounds[0])),
      Math.round(yArtworkStart - Number(designLayer.bounds[1]))
    );

    if (order.mirror) {
      //@ts-ignore
      designLayer.resize(100, -100, AnchorPosition.MIDDLECENTER);
    }

    addExternalBorder(doc, designLayer, order.borderColor);
    addLabels(doc, designLayer, order);

    return designLayer;
  } catch (e) {
    alert(`Failed to place order ${order.orderId}: ${e}`);
    return null;
  }
};

const addExternalBorder = (doc: any, layer: any, hexColor: string) => {
  try {
    const b = layer.bounds;
    const top_px = mmToPx(BORDER_TOP_MM, DPI);
    const bottom_px = mmToPx(BORDER_BOTTOM_MM, DPI);
    const left_px = mmToPx(BORDER_LEFT_MM, DPI);
    const right_px = mmToPx(BORDER_RIGHT_MM, DPI);

    const borderRegion = [
      [Number(b[0]) - left_px, Number(b[1]) - top_px],
      [Number(b[2]) + right_px, Number(b[1]) - top_px],
      [Number(b[2]) + right_px, Number(b[3]) + bottom_px],
      [Number(b[0]) - left_px, Number(b[3]) + bottom_px],
    ];

    const selectionLayer = doc.artLayers.add();
    selectionLayer.name = "Border Frame";
    //@ts-ignore
    selectionLayer.move(layer, ElementPlacement.PLACEAFTER);
    doc.selection.select(borderRegion);

    const hex = (hexColor || "#0078d4").replace("#", "");
    //@ts-ignore
    const color = new SolidColor();
    color.rgb.red = parseInt(hex.substring(0, 2), 16);
    color.rgb.green = parseInt(hex.substring(2, 4), 16);
    color.rgb.blue = parseInt(hex.substring(4, 6), 16);

    doc.selection.fill(color);
    doc.selection.deselect();
  } catch (e) {
    // Ignore border errors
  }
};

const addLabels = (doc: any, layer: any, order: Order) => {
  try {
    const bDesign = layer.bounds;
    const designY_Center = (Number(bDesign[1]) + Number(bDesign[3])) / 2;
    const leftBorderCenter = Number(bDesign[0]) - mmToPx(BORDER_LEFT_MM, DPI) / 2;

    // Model + Variant + Design label, centered in the left border strip
    const labelText = `${order.model} (${order.variant}) - ${order.design}`;
    const labelLayer = createLabelLayer(doc, labelText, 14);
    positionLabel(labelLayer, leftBorderCenter, designY_Center);
  } catch (e) {
    // Ignore label errors
  }
};

const createLabelLayer = (doc: any, text: string, fontSize: number) => {
  const textLayer = doc.artLayers.add();
  //@ts-ignore
  textLayer.kind = LayerKind.TEXT;
  const textItem = textLayer.textItem;
  textItem.size = fontSize;
  textItem.contents = text;
  textItem.color.rgb.red = 255;
  textItem.color.rgb.green = 255;
  textItem.color.rgb.blue = 255;

  //@ts-ignore
  textLayer.rotate(-90, AnchorPosition.MIDDLECENTER);
  //@ts-ignore
  textLayer.rotate(180, AnchorPosition.MIDDLECENTER);
  //@ts-ignore
  textLayer.resize(100, -100, AnchorPosition.MIDDLECENTER);

  return textLayer;
};

const positionLabel = (layer: any, targetX: number, targetY: number) => {
  const b = layer.bounds;
  const currentX = (Number(b[0]) + Number(b[2])) / 2;
  const currentY = (Number(b[1]) + Number(b[3])) / 2;
  layer.translate(Math.round(targetX - currentX), Math.round(targetY - currentY));
};
