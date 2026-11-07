import React, { useEffect } from "react";
import { Puck } from "@measured/puck";
import "@measured/puck/puck.css";

const config = {
  components: {
    HeadingBlock: {
      fields: {
        children: { type: "text" as const },
      },
      render: ({ children }: { children: string }) => <h1>{children}</h1>,
    },
  },
};

const initialData = {};

export default function PuckEditor() {
  useEffect(() => {
    console.log("PuckEditor mounted");
  }, []);

  console.log("Rendering PuckEditor");

  return (
    <div style={{ height: "100vh", width: "100%", background: "#1e293b" }}>
      <Puck config={config} data={initialData} onPublish={(data: any) => console.log("STRING:", JSON.stringify(data))} />
    </div>
  );
}