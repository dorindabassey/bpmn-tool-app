import * as React from 'react';
import { createRoot } from 'react-dom/client';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import bpmnImage from './assets/bpmn.png';
import '../src/assets/style.css';

const App = () => {
    const [bpmnXml, setBpmnXml] = React.useState(null);
    const containerRef = React.useRef(null);
    let modeler = null; // shared modeler instance

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => setBpmnXml(e.target.result);
        reader.readAsText(file);
      };

      const exportHandler = async () => {
        const selection = await miro.board.getSelection();

        const shapes = selection.filter(el => el.type === 'shape');
        const connectors = selection.filter(el => el.type === 'connector');

        if (shapes.length === 0) {
          miro.board.showModal({
            title: 'Export Error',
            body: 'Please select at least one BPMN shape to export.',
            buttons: [{ content: 'OK' }]
          });
          return;
        }

        const idMap = new Map();
        const shapeDefs = [];
        const shapeVisuals = [];
        const flowDefs = [];
        const edgeVisuals = [];

        shapes.forEach((shape, index) => {
          const bpmnId = `Element_${index}`;
          idMap.set(shape.id, bpmnId);

          let tag = 'bpmn:task';
          if (shape.shape === 'circle') {
            tag = shape.content?.toLowerCase().includes('end') ? 'bpmn:endEvent' : 'bpmn:startEvent';
          } else if (shape.shape === 'rhombus') {
            tag = 'bpmn:exclusiveGateway';
          }

          shapeDefs.push(`<${tag} id="${bpmnId}" name="${shape.content || ''}" />`);

          shapeVisuals.push(`
            <bpmndi:BPMNShape bpmnElement="${bpmnId}">
              <dc:Bounds x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" />
            </bpmndi:BPMNShape>
          `);
        });

        connectors.forEach((conn, index) => {
          const sourceId = idMap.get(conn.start.item);
          const targetId = idMap.get(conn.end.item);
          if (!sourceId || !targetId) return;

          const flowId = `Flow_${index}`;
          const label = conn.captions?.[0]?.content || '';

          flowDefs.push(`<bpmn:sequenceFlow id="${flowId}" name="${label}" sourceRef="${sourceId}" targetRef="${targetId}" />`);

          const start = shapes.find(s => s.id === conn.start.item);
          const end = shapes.find(s => s.id === conn.end.item);
          if (start && end) {
            const midStart = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
            const midEnd = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
            edgeVisuals.push(`
              <bpmndi:BPMNEdge bpmnElement="${flowId}">
                <di:waypoint x="${midStart.x}" y="${midStart.y}" />
                <di:waypoint x="${midEnd.x}" y="${midEnd.y}" />
              </bpmndi:BPMNEdge>
            `);
          }
        });

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                        xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                        xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                        xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                        id="Definitions_1"
                        targetNamespace="http://example.bpmn.io/schema/bpmn">
        <bpmn:process id="Process_1" isExecutable="false">
          ${shapeDefs.join('\n    ')}
          ${flowDefs.join('\n    ')}
        </bpmn:process>
        <bpmndi:BPMNDiagram id="Diagram_1">
          <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
            ${shapeVisuals.join('\n      ')}
            ${edgeVisuals.join('\n      ')}
          </bpmndi:BPMNPlane>
        </bpmndi:BPMNDiagram>
      </bpmn:definitions>`;

        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'miro_selected_export.bpmn';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      const clickHandler = async () => {
        if (!bpmnXml) {
          miro.board.showModal({
            title: 'Import Error',
            body: 'Please upload a BPMN file.',
            buttons: [{ content: 'OK' }]
          });
          return;
        }

        modeler = new BpmnModeler({ container: containerRef.current });
        await modeler.importXML(bpmnXml);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(bpmnXml, 'text/xml');

        const registry = modeler.get('elementRegistry');
        const elements = registry.getAll();

        const shapeMap = new Map();
        const documentationMap = new Map();
        const textAnnotationMap = new Map();
        const associationLinks = [];

        // Store BPMN DI information (including waypoints) - This data will be extracted but not used for polyline in Miro
        const bpmnDiEdges = {};
        const bpmnDiAssociations = {};

        // Extract BPMN DI information (Still good to have this parsed for potential future SDK updates or debugging)
        const bpmndiPlane = xmlDoc.querySelector('bpmndi\\:BPMNPlane, BPMNPlane');
        if (bpmndiPlane) {
            const diEdges = bpmndiPlane.querySelectorAll('bpmndi\\:BPMNEdge, BPMNEdge');
            diEdges.forEach(edge => {
                const bpmnElementId = edge.getAttribute('bpmnElement');
                const waypoints = [];
                edge.querySelectorAll('omgdi\\:waypoint, waypoint').forEach(wp => {
                    waypoints.push({
                        x: parseFloat(wp.getAttribute('x')),
                        y: parseFloat(wp.getAttribute('y'))
                    });
                });
                if (bpmnElementId) {
                    bpmnDiEdges[bpmnElementId] = waypoints;
                }
            });
        }

        // Separate elements by type for drawing order
        const participants = [];
        const lanes = [];
        const flowNodes = []; // Tasks, Events, Gateways
        const rawTextAnnotations = []; // Collect raw annotations for overall diagram bounds calculation
        const dataObjectReferences = [];
        const dataStoreReferences = []; 

        // Calculate minX, minY, maxX, maxY of the entire diagram content
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        elements.forEach(el => {
          if (el.businessObject?.documentation?.[0]?.text) {
            documentationMap.set(el.id, el.businessObject.documentation[0].text);
          }
          if (el.type === 'bpmn:Association') {
            const sourceId = el.businessObject?.sourceRef?.id;
            const targetId = el.businessObject?.targetRef?.id;
            if (sourceId && targetId) {
              associationLinks.push({ bpmnId: el.id, sourceId, targetId });
            }
          }

          // Classify elements for drawing order
          if (el.type === 'bpmn:Participant') {
            participants.push(el);
          } else if (el.type === 'bpmn:Lane') {
            lanes.push(el);
          }
          else if (el.type.includes('Task') || el.type.includes('Event') || el.type.includes('Gateway')) {
            flowNodes.push(el);
          } else if (el.type === 'bpmn:TextAnnotation') {
            rawTextAnnotations.push(el);
          } else if (el.type === 'bpmn:DataObjectReference' || el.type === 'bpmn:DataStoreReference') {
            rawTextAnnotations.push(el); // Treat them as raw text annotations for processing
          }


          // Update overall diagram bounds if element has valid coordinates
          if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
              minX = Math.min(minX, el.x);
              minY = Math.min(minY, el.y);
              maxX = Math.max(maxX, el.x + el.width);
              maxY = Math.max(maxY, el.y + el.height);
          }
        });

        // Add padding to the calculated min/max values for better visual spacing
        const padding = 50;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;


        const annotationElements = xmlDoc.querySelectorAll('bpmn\\:textAnnotation, textAnnotation');
        const textAnnotations = [];
        const seenAnnotationIds = new Set();

        annotationElements.forEach(annotation => {
          const id = annotation.getAttribute('id');
          if (seenAnnotationIds.has(id)) return;

          const textNode = annotation.querySelector('bpmn\\:text, text');
          const text = textNode?.textContent?.trim() || '';

          const typeNode = Array.from(annotation.getElementsByTagName('*'))
            .find(el => el.localName === 'signavioType' && el.getAttribute('dataObjectType'));

          const dataObjectType = typeNode?.getAttribute('dataObjectType') || null;

          textAnnotations.push({
            id,
            text,
            type: dataObjectType,
            x: null,
            y: null,
            width: null,
            height: null
          });
          seenAnnotationIds.add(id);
        });

        // Enrich textAnnotations with x/y/width/height from elementRegistry
        rawTextAnnotations.forEach(el => {
          const existing = textAnnotations.find(t => t.id === el.id);
          if (existing) {
            existing.x = el.x;
            existing.y = el.y;
            existing.width = el.width;
            existing.height = el.height;
          } else {
            // Determine the type for DataObjectReference and DataStoreReference
            let type = el.type === 'bpmn:DataObjectReference' ? 'Data Object' :
                       el.type === 'bpmn:DataStoreReference' ? 'Data Store' :
                       el.businessObject?.type; // Fallback for other text annotations

            textAnnotations.push({
              id: el.id,
              text: el.businessObject?.name || el.businessObject?.text, // Use name for data objects/stores, text for annotations
              type: type,
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height
            });
            seenAnnotationIds.add(el.id);
          }
        });

        const viewport = await miro.board.viewport.get();
        // Find an empty space that can contain the entire diagram
        const emptySpace = await miro.board.findEmptySpace({
          x: viewport.x,
          y: viewport.y,
          width: maxX - minX,
          height: maxY - minY
        });

        // Calculate global offsets to shift the entire diagram.
        const globalOffsetX = emptySpace.x - minX;
        const globalOffsetY = emptySpace.y - minY;

        // Store participant IDs and their corresponding Miro shape IDs and dimensions
        const participantMiroData = new Map();

        /// Create Participants first (as background layers for pools)
        for (const el of participants) {
            if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
                let labelText = el.businessObject?.name?.trim() || '';

                // Miro's coordinates are center-based. BPMN.js coordinates are top-left based.
                // Adjusting for Miro's center-based positioning:
                const miroX = el.x + el.width / 2 + globalOffsetX;
                const miroY = el.y + el.height / 2 + globalOffsetY;

                const shape = await miro.board.createShape({
                    content: '',
                    shape: 'rectangle',
                    x: miroX,
                    y: miroY,
                    width: el.width,
                    height: el.height,
                    style: {
                        fillColor: 'transparent',
                        borderWidth: 2,
                        borderColor: '#1a1a1a'
                    }
                });
                shapeMap.set(el.id, shape.id);
                participantMiroData.set(el.id, {
                    miroId: shape.id,
                    originalBpmnX: el.x,
                    originalBpmnY: el.y,
                    miroX: shape.x, // Center X in Miro
                    miroY: shape.y, // Center Y in Miro
                    miroWidth: shape.width,
                    miroHeight: shape.height
                });


                if (labelText) {
                    // Position label to the left, rotated 90 degrees for a pool header
                    await miro.board.createText({
                        content: labelText,
                        // x: shape.x - (shape.width / 2) - 30, // Left of the shape's bounding box
                        x: shape.x - shape.width / 2 + 10, // Adjusted for left alignment within the lane
                        y: shape.y, // Vertically centered
                        style: {
                            fontSize: 14,
                            textAlign: 'center',
                            color: '#1a1a1a',
                            fillColor: 'transparent'
                        },
                        rotation: -90
                    });
                }
            }
        }

        /// Create Lanes (nested within participants visually)
        for (const el of lanes) {
            if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
                let labelText = el.businessObject?.name?.trim() || '';

                // Adjusting for Miro's center-based positioning:
                const miroX = el.x + el.width / 2 + globalOffsetX;
                const miroY = el.y + el.height / 2 + globalOffsetY;

                const shape = await miro.board.createShape({
                    content: '',
                    shape: 'rectangle',
                    x: miroX,
                    y: miroY,
                    width: el.width,
                    height: el.height,
                    style: {
                        fillColor: '#f0f0f0',
                        borderWidth: 1,
                        borderColor: '#1a1a1a'
                    }
                });
                shapeMap.set(el.id, shape.id);

                if (labelText) {
                    // Position label within the lane, adjusting for Miro's center-based coordinates
                    await miro.board.createText({
                        content: labelText,
                        x: shape.x - shape.width / 2 + 20, // A bit in from the left edge of the lane
                        y: shape.y - shape.height / 2 + 10, // A bit down from the top edge of the lane
                        style: {
                            fontSize: 14,
                            textAlign: 'left', // Align text left within its own bounding box
                            color: '#1a1a1a',
                            fillColor: 'transparent'
                        }
                    });
                }
            }
        }

        /// Create other BPMN shapes (Tasks, Events, Gateways) on top
        for (const el of flowNodes) {
          if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {

            let width = el.width;
            let height = el.height;
            let shapeType = 'round_rectangle';
            let fillColor = '#ffffff';
            let fontSize = 12;
            let strokeWidth = 2;

            if (el.type.includes('Gateway')) {
              shapeType = 'rhombus';
            } else if (el.type.includes('Event')) {
              shapeType = 'circle';
              width = 60;
              height = 60;
            }

            let labelText = el.businessObject?.name?.trim() || '';

            const isGateway = el.type.includes('Gateway');
            const hasMeaningfulLabel = labelText && !labelText.startsWith('sid-');
            const contentForShape = isGateway ? '' : labelText; 

            // Adjusting for Miro's center-based positioning:
            const miroX = el.x + el.width / 2 + globalOffsetX;
            const miroY = el.y + el.height / 2 + globalOffsetY;

            const shape = await miro.board.createShape({
              content: contentForShape,
              shape: shapeType,
              x: miroX,
              y: miroY,
              width: width,
              height: height,
              style: {
                fillColor: fillColor,
                borderWidth: strokeWidth,
                borderColor: '#1a1a1a',
                fontSize: fontSize,
                textAlign: 'center'
              }
            });

            shapeMap.set(el.id, shape.id);

            if (isGateway) {
                let symbol = '';
                if (el.businessObject?.gatewayDirection === 'Diverging') {
                    symbol = 'X';
                } else if (el.businessObject?.gatewayDirection === 'Converging') {
                    symbol = 'O';
                }

                if (symbol) {
                    await miro.board.createText({
                        content: symbol,
                        x: shape.x,
                        y: shape.y,
                        style: {
                            fontSize: 24,
                            textAlign: 'center',
                            color: '#1a1a1a'
                        }
                    });
                }
                if (hasMeaningfulLabel) {
                    // Calculate the position for the text to be to the right of the gateway.
                    // shape.x is the center of the gateway.
                    // shape.width / 2 gets us to the right edge of the gateway.
                    // Add a margin (e.g., 20 pixels) to separate the text.
                    const textX = shape.x + (shape.width / 2) - 80; // Adjusted X position
                    
                    await miro.board.createText({
                        content: labelText,
                        x: textX, // Use the calculated X position
                        y: shape.y, // Vertically center with the gateway
                        style: {
                            fontSize: fontSize,
                            textAlign: 'left', // This aligns text within its bounding box to the left
                            color: '#1a1a1a',
                            fillColor: 'transparent'
                        }
                    });
                }
            }

            if (documentationMap.has(el.id)) {
              let commentShape;
              try {
                // Adjusting for Miro's center-based positioning for comments as well:
                const commentX = el.x + el.width / 2 + 100 + 150/2 + globalOffsetX; // el.x is top-left, add half width of comment shape
                const commentY = el.y + el.height / 2 + globalOffsetY;

                commentShape = await miro.board.createShape({
                  shape: 'flow_chart_predefined_process',
                  content: documentationMap.get(el.id),
                  width: 150,
                  height: 70,
                  x: commentX,
                  y: commentY,
                  style: {
                    fillColor: '#fef3bd',
                    borderWidth: 1,
                    borderColor: '#cccccc'
                  }
                });
                await miro.board.createConnector({
                  start: { item: shape.id, snapTo: 'auto' },
                  end: { item: commentShape.id, snapTo: 'auto' },
                  style: {
                    strokeColor: '#CCCCCC',
                    strokeWidth: 1,
                  }
                });
              } catch (err) {
                console.warn('Failed to create comment shape for', el.id, err);
              }
            }
          }
        }

        // Create DataObjectReference shapes
        for (const el of dataObjectReferences) {
            if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
                 // Adjusting for Miro's center-based positioning:
                const miroX = el.x + el.width / 2 + globalOffsetX;
                const miroY = el.y + el.height / 2 + globalOffsetY;

                const shape = await miro.board.createShape({
                    content: el.businessObject?.name?.trim() || '',
                    shape: 'flow_chart_data', // Data object shape
                    x: miroX,
                    y: miroY,
                    width: el.width,
                    height: el.height,
                    style: {
                        fillColor: '#ffffff',
                        borderWidth: 1,
                        borderColor: '#1a1a1a',
                        fontSize: 12,
                        textAlign: 'center'
                    }
                });
                shapeMap.set(el.id, shape.id); // Add to shapeMap so associations can find it
            }
        }

        // Create DataStoreReference shapes [Changed Block]: Added logic for DataStoreReference
        for (const el of dataStoreReferences) {
            if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
                 // Adjusting for Miro's center-based positioning:
                const miroX = el.x + el.width / 2 + globalOffsetX;
                const miroY = el.y + el.height / 2 + globalOffsetY;

                const shape = await miro.board.createShape({
                    content: el.businessObject?.name?.trim() || '',
                    shape: 'flow_chart_database', // Use database shape (cylinder)
                    x: miroX,
                    y: miroY,
                    width: el.width,
                    height: el.height,
                    style: {
                        fillColor: '#ffffff',
                        borderWidth: 1,
                        borderColor: '#1a1a1a',
                        fontSize: 12,
                        textAlign: 'center'
                    }
                });
                shapeMap.set(el.id, shape.id); // Add to shapeMap
            }
        }


        /// Create Text Annotations and connect them
        // Updated iconMap and logic for Data Objects/Stores
        for (const ta of textAnnotations) {
          const iconMap = {
            "IT-System": "🖥️",
            "ProcessParticipant": "👤",
            "Database": "🗄️",
            "Data Object": "📄", // Icon for Data Object
            "Data Store": "🗄️"  // Icon for Data Store (reusing database icon)
          };

          const icon = iconMap[ta.type] || '';
          // Determine if a shape or just text should be used for the annotation.
          // Now, Data Objects and Data Stores will also be treated as annotations.
          const useShapeForAnnotation = (ta.type === "IT-System" || ta.type === "Database" || ta.type === "Data Object" || ta.type === "Data Store" || (!icon && ta.width && ta.height)); // [Changed Line]

          const baseX = typeof ta.x === 'number' ? ta.x : 0;
          const baseY = typeof ta.y === 'number' ? ta.y : 0;
          const annWidth = typeof ta.width === 'number' && ta.width > 0 ? ta.width : 150;
          const annHeight = typeof ta.height === 'number' && ta.height > 0 ? ta.height : 70;

          let annotationMiroItem = null;
          try {
            // Adjusting for Miro's center-based positioning for text annotations:
            const miroX = baseX + annWidth / 2 + globalOffsetX;
            const miroY = baseY + annHeight / 2 + globalOffsetY;

            if (useShapeForAnnotation) {
                annotationMiroItem = await miro.board.createShape({
                  shape: 'round_rectangle', // Using round_rectangle for a background box
                  content: icon ? `${icon} ${ta.text}` : ta.text,
                  width: annWidth,
                  height: annHeight,
                  x: miroX,
                  y: miroY,
                  style: {
                    fillColor: '#e1e1e1',
                    borderWidth: 1,
                    borderColor: '#cccccc',
                    fontSize: 14,
                    textAlign: 'center'
                  }
                });
            } else {
                annotationMiroItem = await miro.board.createText({
                  content: icon ? `${icon} ${ta.text}` : ta.text,
                  x: miroX, // For text, X/Y is still top-left, but adjust relative to overall diagram shift.
                  y: miroY,
                  style: {
                    fontSize: 16,
                    textAlign: 'left',
                    color: '#000000',
                    fillColor: 'transparent'
                  }
                });
            }
            if (annotationMiroItem && annotationMiroItem.id) {
              textAnnotationMap.set(ta.id, annotationMiroItem.id);
            }
          } catch (error) {
              console.error(`Failed to create text annotation ${ta.id}:`, error);
          }
        }

        /// Create Sequence Flows (solid lines)
        for (const el of elements) {
          if (el.type === 'bpmn:SequenceFlow') {
            const source = el.businessObject.sourceRef?.id;
            const target = el.businessObject.targetRef?.id;
            const startId = shapeMap.get(source);
            const endId = shapeMap.get(target);
      
            if (startId && endId) {
              const startShape = await miro.board.get({ id: startId });
              const endShape = await miro.board.get({ id: endId });
              
              // Miro board.get returns an array, take the first element
              const sx = startShape[0].x;
              const sy = startShape[0].y;
              const ex = endShape[0].x;
              const ey = endShape[0].y;
              
              let startSnap = 'right';
              let endSnap = 'left';
              
              // Check for vertical alignment
              const isVertical = Math.abs(sx - ex) < 50;
              
              if (isVertical) {
                if (sy < ey) {
                  startSnap = 'bottom';
                  endSnap = 'top';
                } else {
                  startSnap = 'top';
                  endSnap = 'bottom';
                }
              } else {
                const sourceElement = elements.find(e => e.id === source);
                const targetElement = elements.find(e => e.id === target);
                
                const gatewaySnapCounter = new Map();
                // Diverging into a gateway
                if (sourceElement?.type?.includes('Gateway') && sourceElement?.businessObject?.gatewayDirection === 'Diverging') {
                   const count = gatewaySnapCounter.get(source) || 0;
                  // Route diverging lines from different edges
                  if (sy < ey) {
                    startSnap = 'bottom';
                    endSnap = 'left';
                  } else if (sy > ey) {
                    startSnap = 'top';
                    endSnap = 'left';
                    // Rotate based on number of previous outgoing paths from this gateway
                  } else if (count === 0) {
                        startSnap = 'right';
                        endSnap = 'left';
                    } else if (count === 1) {
                        startSnap = 'right';
                        endSnap = 'bottom';
                    } else if (count === 2) {
                        startSnap = 'bottom';
                        endSnap = 'top';
                    } else if (count === 3) {
                        startSnap = 'top';
                        endSnap = 'bottom';
                    } else {
                        // fallback for additional flows (wrap around)
                        startSnap = 'right';
                        endSnap = 'left';
                    }
                }
                // Converging into a gateway
                if (targetElement?.type?.includes('Gateway') && targetElement?.businessObject?.gatewayDirection === 'Converging') {
                  // Route flows from different sides based on vertical position
                  if (sy < ey) {
                    startSnap = 'right';
                    endSnap = 'top';
                  } else if (sy > ey) {
                    startSnap = 'right';
                    endSnap = 'bottom';
                  } else {
                    startSnap = 'right';
                    endSnap = 'left';
                  }
                }
              }
              
              const connectorConfig = {
                start: { item: startId, snapTo: startSnap },
                end: { item: endId, snapTo: endSnap },
                style: {
                  strokeColor: '#1a1a1a',
                  strokeWidth: 2
                },
                shape: 'elbowed'
              };
      
              const label = el.businessObject.name?.trim();
              if (label) {
                connectorConfig.captions = [
                  { position: 0.5, content: label }
                ];
              }
      
              await miro.board.createConnector(connectorConfig);
            }
          }
        }

        /// Draw associations (light grey)
        for (const assoc of associationLinks) {
          const startId = shapeMap.get(assoc.sourceId);
          const endId = textAnnotationMap.get(assoc.targetId) || shapeMap.get(assoc.targetId);

          if (startId && endId) {
            const connectorConfig = {
              start: { item: startId, snapTo: 'auto' },
              end: { item: endId, snapTo: 'auto' },
              style: {
                strokeColor: '#1a1a1a',
                strokeWidth: 1,
              }
            };

            await miro.board.createConnector(connectorConfig);
          } else {
            console.warn(`Could not create association. Missing startId (${startId ? assoc.sourceId : 'not found'}) or endId (${endId ? assoc.targetId : 'not found'}).`);
          }
        }

        alert('✅ BPMN imported with flows, associations, comments, and layout!');
      };


    return ( <div className="grid wrapper">
      <div className="cs1 ce12">
        <img src={bpmnImage} alt="BPMN!" />
      </div>
      <input type="file" accept=".bpmn,.xml" onChange={handleFileChange} className="cs1 ce12" />
      <button className="button button-primary" type="button" onClick={clickHandler}  >
		Import BPMN
	  </button>
      <button className="button button-primary" type="button" onClick={exportHandler}  >
		Export BPMN
	  </button>
      <div ref={containerRef} style={{ display: 'none' }}></div>
    </div> );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);