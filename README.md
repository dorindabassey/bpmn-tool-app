## Bpmn Tool App

**&nbsp;ℹ&nbsp;Note**:

- We recommend a Chromium-based web browser for local development with HTTP. \
  Safari enforces HTTPS; therefore, it doesn't allow localhost through HTTP.
- For more information, visit our [developer documentation](https://developers.miro.com).

### BPMN Importer/Exporter for Miro
### About the app

This React application provides functionality to import BPMN (Business Process Model and Notation) diagrams from .bpmn or .xml files onto a Miro board and export selected BPMN elements from a Miro board back into a .bpmn file.
#### Features

Import BPMN: Upload a .bpmn or .xml file to parse the BPMN diagram and render its elements (tasks, events, gateways, pools, lanes, sequence flows, associations, and text annotations/comments) onto your Miro board.

Export BPMN: Select BPMN shapes and connectors on your Miro board to export them as a .bpmn file. The exporter attempts to map Miro shapes back to their corresponding BPMN elements and reconstruct the XML.

Automatic Layout: When importing, the application attempts to find an empty space on the Miro board and lay out the imported BPMN elements relative to that space, preserving their original relative positioning from the BPMN file.

BPMN Element Mapping:

- Shapes: Tasks, Start Events, End Events, and Exclusive Gateways are mapped to Miro's round_rectangle, circle, and rhombus shapes, respectively.

- Pools/Participants: Rendered as transparent rectangles with a rotated text label on the left.

- Lanes: Rendered as light grey rectangles with a text label at the top-left.

- Sequence Flows: Rendered as solid black connectors with elbowed routing.

- Associations: Rendered as thin grey connectors.

- Text Annotations/Comments: Displayed as Miro text elements or shapes, with special handling for IT-System, ProcessParticipant, Database, Data Object, and Data Store types, including relevant emojis.

- Documentation: BPMN documentation elements associated with shapes are imported as Miro comment shapes linked to the corresponding BPMN element.

### How to Use

Install the App: This application is designed to run within the Miro platform as a custom app.

Open the App: Once installed, open the app from your Miro board.

Import a BPMN File:

- Click the "Choose File" button.

- Select a .bpmn or .xml file from your computer.

- Click the "Import BPMN" button.

- The BPMN diagram will be rendered on your Miro board in an empty space.

Export BPMN Elements:

- On your Miro board, select the BPMN shapes and connectors you wish to export.

- Click the "Export BPMN" button.

- A .bpmn file named miro_selected_export.bpmn will be downloaded to your computer, containing the XML representation of your selected diagram elements.

### Technical Details

React: The user interface is built using React.

bpmn-js: The bpmn-js library is used for parsing and rendering BPMN XML internally, allowing the application to extract element positions and relationships.

Miro SDK: The Miro Web SDK (miro.board) is extensively used to interact with the Miro board, including creating shapes, connectors, and text, as well as managing viewport and selection.

File Handling: Standard JavaScript FileReader is used for importing files, and Blob and URL.createObjectURL are used for generating and downloading the exported .bpmn file.

Layout Algorithm: The import functionality calculates the overall bounding box of the BPMN diagram and uses miro.board.findEmptySpace to place the diagram on the board. It then applies a global offset to all elements to maintain their relative positions.

Shape Mapping Logic: The exportHandler contains logic to identify Miro shapes (rectangles, circles, rhombuses) and map them back to BPMN elements (bpmn:task, bpmn:startEvent, bpmn:endEvent, bpmn:exclusiveGateway) based on their shape type and content. Connectors are mapped to bpmn:sequenceFlow.

Built using [`create-miro-app`](https://www.npmjs.com/package/create-miro-app).

This app uses [Vite](https://vitejs.dev/). \
If you want to modify the `vite.config.js` configuration, see the [Vite documentation](https://vitejs.dev/guide/).

### Development Setup (for local testing/development)

- Run `npm i` to install dependencies.
- Run `npm start` to start developing. \
  Your URL should be similar to this example:
 ```
 http://localhost:3000
 ```
- Paste the URL under **App URL** in your
  [app settings](https://developers.miro.com/docs/build-your-first-hello-world-app#step-3-configure-your-app-in-miro).
- Open a board; you should see your app in the app toolbar or in the **Apps**
  panel.

### How to build the app

- Run `npm run build`. \
  This generates a static output inside [`dist/`](./dist), which you can host on a static hosting
  service.

### Folder structure

<!-- The following tree structure is just an example -->

```
.
├── src
│  ├── assets
│  │  └── style.css
│  ├── app.jsx      // The code for the app lives here
│  └── index.js    // The code for the app entry point lives here
├── app.html       // The app itself. It's loaded on the board inside the 'appContainer'
└── index.html     // The app entry point. This is what you specify in the 'App URL' box in the Miro app settings
```
