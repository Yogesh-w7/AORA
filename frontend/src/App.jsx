import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";

function App() {

  return (

    <div className="app-root">

      {/* Loader */}
      <Loader />

      {/* Debug UI */}
      <Leva hidden />

      {/* ===============================
      LEFT SIDE AVATAR CANVAS
      =============================== */}

      <Canvas
        shadows
        camera={{
          position: [0, 2, 5],
          fov: 30,
        }}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "65vw",     // ⭐ LEFT WIDTH
          height: "100vh",
          zIndex: 0
        }}
      >

        <Experience />

      </Canvas>



      {/* ===============================
      RIGHT SIDE CHAT UI
      =============================== */}

      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          width: "35vw",   // ⭐ CHAT WIDTH
          height: "100vh",
          zIndex: 10
        }}
      >

        <UI />

      </div>

    </div>

  );

}

export default App;