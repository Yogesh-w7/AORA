import {
  CameraControls,
  ContactShadows,
  Environment,
  Text,
} from "@react-three/drei";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

import { useChat } from "../hooks/useChat";
import { Avatar } from "./Avatar";

const Dots = (props) => {

  const { loading } = useChat();

  const [loadingText, setLoadingText] =
    useState("");

  useEffect(() => {

    if (loading) {

      const interval =
        setInterval(() => {

          setLoadingText((text) => {

            if (text.length > 2)
              return ".";

            return text + ".";

          });

        }, 800);

      return () =>
        clearInterval(interval);

    } else {

      setLoadingText("");

    }

  }, [loading]);

  if (!loading) return null;

  return (

    <group {...props}>

      <Text
        fontSize={0.14}
        anchorX="left"
        anchorY="bottom"
      >

        {loadingText}

        <meshBasicMaterial
          attach="material"
          color="black"
        />

      </Text>

    </group>

  );

};

export const Experience = () => {

  const cameraControls = useRef();

  const { cameraZoomed } =
    useChat();

  // Initial camera

  useEffect(() => {

    cameraControls.current.setLookAt(
      0,
      2,
      5,
      0,
      1.5,
      0
    );

  }, []);

  // Zoom behavior

  useEffect(() => {

    if (cameraZoomed) {

      cameraControls.current.setLookAt(
        0,
        1.5,
        1.8,
        0,
        1.5,
        0,
        true
      );

    } else {

      cameraControls.current.setLookAt(
        0,
        2,
        5,
        0,
        1.5,
        0,
        true
      );

    }

  }, [cameraZoomed]);

  return (

    <>

      {/* Camera */}

      <CameraControls ref={cameraControls} />

      {/* Lighting */}

      <Environment preset="sunset" />

      {/* Loading dots */}

      <Suspense>

        <Dots
          position-y={1.75}
          position-x={-0.02}
        />

      </Suspense>

      {/* ⭐ Glow Behind Avatar

      <mesh position={[0, 1.5, -3]}>

        <circleGeometry args={[3.5, 64]} />

        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.12}
        />

      </mesh> */}

      {/* ⭐ Avatar — NORMAL SIZE */}

      <Avatar />

      {/* Floor shadow */}

      <ContactShadows
        opacity={0.7}
        blur={2.5}
        far={5}
      />

    </>

  );

};