import * as React from 'react'; 
import { createRoot } from 'react-dom/client'; 
import BpmnModeler from 'bpmn-js/lib/Modeler';

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
          alert('Please select at least one BPMN shape to export.');
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
      
          // Map shape to BPMN type
          let tag = 'bpmn:task';
          if (shape.shape === 'circle') {
            tag = shape.content?.toLowerCase().includes('end') ? 'bpmn:endEvent' : 'bpmn:startEvent';
          } else if (shape.shape === 'rhombus') {
            tag = 'bpmn:exclusiveGateway';
          }
      
          shapeDefs.push(`<${tag} id="${bpmnId}" name="${shape.content}" />`);
      
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
      
          // Estimate waypoints from shapes
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
          alert("Please upload a BPMN file.");
          return;
        }
      
        modeler = new BpmnModeler({ container: containerRef.current });
        await modeler.importXML(bpmnXml);
      
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(bpmnXml, 'text/xml');
      
        const edgeElements = xmlDoc.querySelectorAll('bpmndi\\:BPMNEdge, BPMNEdge');
        const directionMap = new Map();
      
        edgeElements.forEach(edge => {
          const id = edge.getAttribute('bpmnElement');
          const waypoints = edge.querySelectorAll('di\\:waypoint, waypoint');
          if (waypoints.length >= 2) {
            const x1 = parseFloat(waypoints[0].getAttribute('x'));
            const y1 = parseFloat(waypoints[0].getAttribute('y'));
            const x2 = parseFloat(waypoints[waypoints.length - 1].getAttribute('x'));
            const y2 = parseFloat(waypoints[waypoints.length - 1].getAttribute('y'));
            const direction = Math.abs(x2 - x1) > Math.abs(y2 - y1) ? 'right' : 'down';
            directionMap.set(id, direction);
          }
        });
      
        const registry = modeler.get('elementRegistry');
        const elements = registry.getAll();
      
        const shapeMap = new Map();
        const documentationMap = new Map();
        const gatewayDirections = new Map();
        const associationLinks = [];
        const annotationElements = xmlDoc.querySelectorAll('bpmn\\:textAnnotation, textAnnotation');
        const textAnnotations = [];
        const seenAnnotationIds = new Set();
        
        // From XML parsing
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
            x: null,  // placeholder
            y: null
          });
        
          seenAnnotationIds.add(id);
        });
        
        // Second: Enrich with x/y from elementRegistry if available
        elements.forEach(el => {
          if (el.businessObject.documentation?.[0]?.text) {
            documentationMap.set(el.id, el.businessObject.documentation[0].text);
          }
        
          if (el.type === 'bpmn:TextAnnotation') {
            const existing = textAnnotations.find(t => t.id === el.id);
            if (existing) {
              existing.x = el.x;
              existing.y = el.y;
            } else {
              // fallback: annotation only found in elementRegistry
              textAnnotations.push({
                id: el.id,
                text: el.businessObject.text,
                x: el.x,
                y: el.y
              });
              seenAnnotationIds.add(el.id);
            }
          }
          if (el.type.includes('Gateway')) {
            const dir = el.businessObject.gatewayDirection || 'Unspecified';
            gatewayDirections.set(el.id, dir);
          }
        //   if (el.type === 'bpmn:Association') {
        //     const sourceId = el.businessObject.sourceRef?.id;
        //     const targetId = el.businessObject.targetRef?.id;
        //     if (sourceId && targetId) {
        //       associationLinks.push({ sourceId, targetId });
        //     }
        //   }
          if (el.type === 'bpmn:Association') {
            const sourceId = el.businessObject.sourceRef?.id;
            const targetId = el.businessObject.targetRef?.id;

            if (sourceId && targetId) {
                const source = registry.get(sourceId);
                const target = registry.get(targetId);

                const sx = source?.x ?? 0;
                const sy = source?.y ?? 0;
                const tx = target?.x ?? 0;
                const ty = target?.y ?? 0;

                const direction = Math.abs(sx - tx) > Math.abs(sy - ty) ? 'horizontal' : 'vertical';

                associationLinks.push({
                sourceId,
                targetId,
                direction,
                offsetY: ty - sy
                });
            }
          }

        });
      
        // Build flow graph
        const flowGraph = new Map();
        elements.forEach(el => {
          if (el.type === 'bpmn:SequenceFlow') {
            const source = el.businessObject.sourceRef?.id;
            const target = el.businessObject.targetRef?.id;
            if (!flowGraph.has(source)) flowGraph.set(source, []);
            flowGraph.get(source).push(target);
          }
        });
      
        // Place nodes
        const positionMap = new Map();
        const placed = new Set();
        const divergingGatewayCount = new Map(); // key = depth, value = counter

        function placeNode(id, depth = 0, row = 0) {
        if (!id || placed.has(id)) return;
        const el = elements.find(e => e.id === id);
        const gatewayDirection = el?.businessObject?.gatewayDirection;

        // Handle diverging gateway vertical offset
        if (gatewayDirection === 'Diverging') {
            const count = divergingGatewayCount.get(depth) || 0;
            const offset = count % 2 === 0 ? -Math.ceil(count / 2) : Math.ceil(count / 2);
            row += offset;
            divergingGatewayCount.set(depth, count + 1);
        }

        const x = depth * 500;
        const y = row * 200;
        positionMap.set(id, { x, y });
        placed.add(id);

        const targets = flowGraph.get(id) || [];

        if (gatewayDirection === 'Diverging') {
            const mid = Math.floor(targets.length / 2);
            targets.forEach((targetId, index) => {
            const verticalOffset = index - mid;
            placeNode(targetId, depth + 1, row + verticalOffset);
            });
        } else if (gatewayDirection === 'Converging') {
            const mid = Math.floor(targets.length / 2);
            targets.forEach((targetId, index) => {
            const verticalOffset = index - mid;
            placeNode(targetId, depth + 1, row + verticalOffset);
            });
        } else {
            targets.forEach(targetId => {
            placeNode(targetId, depth + 1, row);
            });
        }
        }

        
      
        const startEvents = elements.filter(el => el.type === 'bpmn:StartEvent');
        startEvents.forEach(start => placeNode(start.id));
      
        const viewport = await miro.board.viewport.get();
        const space = await miro.board.findEmptySpace({
          x: viewport.x,
          y: viewport.y,
          width: 2000,
          height: 2000
        });
        const offsetX = space.x;
        const offsetY = space.y;
      
        // Create shapes
        const textAnnotationMap = new Map();
      
        for (const [id, { x, y }] of positionMap.entries()) {
          const el = elements.find(e => e.id === id);
          if (!el || !(el.type.includes('Task') || el.type.includes('Event') || el.type.includes('Gateway'))) {
            continue;
          }
      
          let width = 200;
          let height = 100;
          let shapeType = 'round_rectangle';
          if (el.type.includes('Gateway')) {
            shapeType = 'rhombus';
            const hasName = !!el.businessObject.name?.trim() && !el.businessObject.name.startsWith('sid-');
            if (!hasName) {
              width = 40;
              height = 40;
            }
          }
          if (el.type.includes('Event')) {
            shapeType = 'circle';
            width = 60;
            height = 60;
          }
      
          let labelText = el.businessObject.name?.trim();
            const isGateway = el.type.includes('Gateway');
            const isEvent = el.type.includes('Event');
            const isTask = el.type.includes('Task');

            if (isGateway) {
            const hasName = labelText && !labelText.startsWith('sid-');
            if (!hasName) labelText = ''; // remove raw sid text
            }
            if (!labelText && !isEvent && !isGateway) {
            labelText = el.id; // fallback for unnamed tasks
            }

      
          const shape = await miro.board.createShape({
            content: el.type.includes('Event') ? '' : labelText,
            shape: shapeType,
            x: x + offsetX,
            y: y + offsetY,
            width,
            height,
            style: {
              fillColor: '#ffffff',
              borderWidth: 2
            }
          });

          if (isGateway && labelText === '') {
            const dir = el.businessObject.gatewayDirection;
            const symbol = 'O';
          
            if (symbol) {
              await miro.board.createText({
                content: symbol,
                x: x + offsetX,
                y: y + offsetY,
                style: {
                  fontSize: 24,
                  textAlign: 'center'
                }
              });
            }
          }

          shapeMap.set(el.id, shape.id);
      
          if (el.type.includes('Event')) {
            await miro.board.createText({
              content: labelText,
              x: x + offsetX,
              y: y + offsetY + 80,
              style: { fontSize: 14, textAlign: 'center' }
            });
          }
      
          if (documentationMap.has(el.id)) {
            let commentShape;
            try {
              commentShape = await miro.board.createShape({
                shape: 'flow_chart_predefined_process',
                content: documentationMap.get(el.id),
                width: 150,
                height: 70,
                x: x + offsetX + 250,
                y: y + offsetY,
                style: {
                  fillColor: '#fef3bd',
                  borderWidth: 1
                }
              });
            } catch (err) {
              console.warn('Failed to create comment shape for', el.id, err);
            }

            await miro.board.createConnector({
              start: { item: shape.id, snapTo: 'auto' },
              end: { item: commentShape.id, snapTo: 'auto' },
              style: {
                strokeColor: '#CCCCCC',
                strokeWidth: 1,
              }
            });
          }
        }
      
        // Create textAnnotations
        for (const [i, ta] of textAnnotations.entries()) {
          const iconMap = {
            "IT-System": "🖥️",
            "ProcessParticipant": "👤",
            "Database": "🗄️"
          };
          console.log('tpye is:', ta.type);
        
          const icon = iconMap[ta.type] || '';
          const label = `${icon} ${ta.text}`;
        
          // ✅ Use fallback if ta.x or ta.y is missing
          const baseX = typeof ta.x === 'number' ? ta.x : 0;
          const baseY = typeof ta.y === 'number' ? ta.y : i * 200;

          let taShape;
          if (icon) {
            // Render just the icon as a text widget
            const iconShape = await miro.board.createText({
              content: icon,
              width: 60,
              height: 60,
              x: ta.x + offsetX,
              y: ta.y + offsetY,
              style: {
                fontSize: 32,
                textAlign: 'center'
              }
            });

            // Create a text label next to it
            const labelText = await miro.board.createText({
              content: ta.text,
              x: ta.x + offsetX + 80, // offset to the right
              y: ta.y + offsetY,
              style: {
                fontSize: 16,
                textAlign: 'left',
                color: '#000000'
              }
            });

            let groupId = null;
            let group;

            try {
              group = await miro.board.group({
                childrenIds: [iconShape.id, labelText.id]
              });
              groupId = group?.id || iconShape.id;
            } catch (error) {
              console.warn(`Could not group icon and label for ${ta.id}:`, error);
              // Just fall back to tracking the icon
              groupId = iconShape.id;
            }
            textAnnotationMap.set(ta.id, groupId);

          } else {
            // Default annotation
            taShape = await miro.board.createShape({
              shape: 'flow_chart_predefined_process',
              content: ta.text,
              width: 150,
              height: 70,
              x: ta.x + offsetX,
              y: ta.y + offsetY,
              style: {
                fillColor: '#ffffff',
                borderWidth: 1
              }
            });
            textAnnotationMap.set(ta.id, taShape.id);
          }
        }
      
        // Draw sequenceFlows (solid)
        for (const el of elements) {
          if (el.type === 'bpmn:SequenceFlow') {
            const source = el.businessObject.sourceRef?.id;
            const target = el.businessObject.targetRef?.id;
            const startId = shapeMap.get(source);
            const endId = shapeMap.get(target);
      
            if (startId && endId) {
              const startShape = await miro.board.get({ id: startId });
              const endShape = await miro.board.get({ id: endId });
              
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
      
        // Draw associations (light grey)
        for (const assoc of associationLinks) {
          const startId = shapeMap.get(assoc.sourceId);
          const endId = textAnnotationMap.get(assoc.targetId);
      
          if (startId && endId) {
            const startShape = await miro.board.get({ id: startId });
            const endShape = await miro.board.get({ id: endId });
            
            let startSnap = 'auto';
            let endSnap = 'auto';
            
            await miro.board.createConnector({
              start: { item: startId, snapTo: startSnap },
              end: { item: endId, snapTo: endSnap },
              style: {
                strokeColor: '#1a1a1a',
                strokeWidth: 1
              }
            });
          }
        }

        // let verticalOffset = 100; // distance below the shape

        // for (const assoc of associationLinks) {
        // const startId = shapeMap.get(assoc.sourceId);
        // const endId = textAnnotationMap.get(assoc.targetId);

        // if (startId && endId) {
        //     const startShape = await miro.board.getById(startId);
        //     const endShape = await miro.board.getById(endId);

        //     const sx = startShape.x;
        //     const sy = startShape.y;

        //     // ✅ Reposition the annotation directly below the source shape
        //     const targetX = sx;
        //     const targetY = sy + verticalOffset;

        //     const newAnnotation = await miro.board.createText({
        //     content: endShape.content,
        //     x: targetX,
        //     y: targetY,
        //     });

        //     await miro.board.createConnector({
        //     start: { item: startId, snapTo: 'bottom' },
        //     end: { item: newAnnotation.id, snapTo: 'top' },
        //     style: {
        //         strokeColor: '#CCCCCC',
        //         strokeWidth: 1,
        //         //lineStyle: 'dotted'
        //     },
        //     //shape: 'elbowed'
        //     });

        //     // Optional: update the map if needed
        //     textAnnotationMap.set(assoc.targetId, newAnnotation.id);
        // }
        // }
        alert('✅ BPMN imported with flows, associations, comments, and layout!');
      };      
      
          
    return ( <div className="grid wrapper"> 
      <div className="cs1 ce12"> 
        <img src="/src/assets/congratulations.png" alt=""/> 
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
