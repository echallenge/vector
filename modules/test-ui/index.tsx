import "react-app-polyfill/ie11";
import "regenerator-runtime";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { config } from "dotenv";

import { ConnextModal } from "@connext/vector-modal";
import { BrowserNode } from "../browser-node/src";

config();

function App() {
  const [showModal, setShowModal] = React.useState(false);

  const node = new BrowserNode({
    routerPublicIdentifier: "vector7tbbTxQp8ppEQUgPsbGiTrVdapLdU5dH7zTbVuXRf1M4CEBU9Q",
    iframeSrc: "https://wallet.connext.network",
    supportedChains: [5, 80001],
  });

  return (
    <>
      <button onClick={() => setShowModal(true)}>Hello World</button>
      <ConnextModal
        showModal={showModal}
        routerPublicIdentifier="vector7tbbTxQp8ppEQUgPsbGiTrVdapLdU5dH7zTbVuXRf1M4CEBU9Q"
        depositAssetId={"0x655F2166b0709cd575202630952D71E2bB0d61Af"}
        depositChainId={5}
        withdrawAssetId={"0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1"}
        withdrawChainId={80001}
        withdrawalAddress={"0x75e4DD0587663Fce5B2D9aF7fbED3AC54342d3dB"}
        onClose={() => setShowModal(false)}
        connextNode={node}
      />
    </>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
