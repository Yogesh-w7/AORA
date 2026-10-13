import { useRef, useState, useEffect } from "react";
import { useChat } from "../hooks/useChat";

export const UI = ({ hidden }) => {

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const [imageFile, setImageFile] = useState(null);
  const [chatVisible, setChatVisible] = useState(true);

  const {
    chat,
    loading,
    cameraZoomed,
    setCameraZoomed,
    messages = [],
  } = useChat();

  const [history, setHistory] = useState([]);
  const lastMsgCount = useRef(0);

  // ===============================
  // MESSAGE HISTORY
  // ===============================

  useEffect(() => {

    if (messages.length > lastMsgCount.current) {

      const newMsgs =
        messages.slice(lastMsgCount.current);

      const formatted =
        newMsgs.map((msg) => ({
          role: "assistant",
          content:
            msg.content ||
            msg.text ||
            "",
        }));

      setHistory(prev => [
        ...prev,
        ...formatted
      ]);

      lastMsgCount.current =
        messages.length;

    }

  }, [messages]);

  // ===============================
  // AUTO SCROLL
  // ===============================

  useEffect(() => {

    chatEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });

  }, [history, loading]);

  const preventScrollLeak = (e) =>
    e.stopPropagation();

  // ===============================
  // SEND MESSAGE
  // ===============================

  const handleSend = () => {

    const text =
      inputRef.current?.value.trim();

    if (!text && !imageFile)
      return;

    if (!loading) {

      let previewImage = null;

      if (imageFile) {

        previewImage =
          URL.createObjectURL(imageFile);

      }

      setHistory(prev => [

        ...prev,

        {
          role: "user",
          content: text,
          image: previewImage
        }

      ]);

      chat(text, {
        medical: true,
        imageFile
      });

      inputRef.current.value = "";

      setImageFile(null);

      if (fileInputRef.current)
        fileInputRef.current.value = "";

    }

  };

  if (hidden) return null;

  return (

<div className="fixed inset-0 z-40 pointer-events-none">

{/* AVATAR GLOW */}

<div className="avatar-glow-container pointer-events-none">

  <div className="avatar-glow"></div>

</div>


{/* CAMERA CONTROLS */}

<div className="
absolute
right-6
top-1/2
-translate-y-1/2
flex flex-col gap-4
pointer-events-auto
z-50">

<button
onClick={() =>
setCameraZoomed(!cameraZoomed)
}
className="
p-4 rounded-2xl
bg-gradient-to-br
from-blue-500
to-cyan-500
text-white shadow-xl
hover:scale-110 transition">

{cameraZoomed ? "🔍−" : "🔍+"}

</button>

<button
onClick={() =>
document.body.classList.toggle("greenScreen")
}
className="
p-4 rounded-2xl
bg-gradient-to-br
from-green-500
to-emerald-500
text-white shadow-xl
hover:scale-110 transition">

🎥

</button>

</div>


{/* FLOATING LAUNCHER */}

{!chatVisible && (

<button
onClick={() =>
setChatVisible(true)
}
className="
fixed bottom-10 right-10
pointer-events-auto
z-50">

<div className="
w-20 h-20
rounded-full
bg-gradient-to-br
from-teal-400
to-cyan-500
flex items-center
justify-center
text-white text-4xl
shadow-2xl
hover:scale-110 transition
animate-soft-breath">

💙

</div>

</button>

)}


{/* MAIN CHAT PANEL */}

{chatVisible && (

<div className="
absolute
top-6 bottom-6 right-6
w-full max-w-[480px]
pointer-events-auto">

<div className="
h-full flex flex-col
bg-white/85 backdrop-blur-2xl
rounded-3xl border
shadow-xl overflow-hidden">


{/* ===============================
HEADER (N LOGO)
=============================== */}

<div className="
px-6 py-5
border-b
bg-gradient-to-r
from-teal-50
to-cyan-50">

<div className="
flex justify-between items-center">

{/* LEFT */}

<div className="flex items-center gap-4">

{/* BIG N LOGO */}

<div className="
w-14 h-14
rounded-full
bg-gradient-to-br
from-teal-500
to-cyan-500
flex items-center
justify-center
text-white
text-2xl
font-black
shadow-lg
animate-soft-breath">

N

</div>

{/* TEXT */}

<div className="leading-tight">

<h1 className="
text-2xl font-black
text-teal-700
tracking-tight">

NOVA

</h1>

<p className="
text-xs
text-teal-600
font-medium">

Your wellness companion

</p>

</div>

</div>


{/* CLOSE */}

<button
onClick={() =>
setChatVisible(false)
}
className="
text-xl
text-gray-600
hover:text-red-500
transition">

✕

</button>

</div>


<p className="
mt-2 text-sm text-rose-600">

⚠️ Educational support only

</p>

</div>


{/* ===============================
CHAT AREA
=============================== */}

<div
className="
flex-1 overflow-y-auto
px-8 py-8 space-y-8"

onWheel={preventScrollLeak}
onTouchMove={preventScrollLeak}
>

{history.length === 0 ? (

<div className="text-center py-20">

<div className="text-8xl mb-6 animate-soft-bob">
💙🌿
</div>

<h2 className="
text-2xl font-bold text-teal-700">

Hi! I'm NOVA

</h2>

<p className="text-gray-600 mt-3">
Tell me how you're feeling today.
</p>

</div>

) : (

history.map((msg, idx) => (

<div
key={idx}
className={`flex gap-4 animate-fade-up
${msg.role === "user"
? "justify-end"
: "justify-start"}`}
>

{/* ASSISTANT AVATAR (N) */}

{msg.role !== "user" && (

<div className="
w-10 h-10
rounded-full
bg-gradient-to-br
from-teal-500
to-cyan-500
flex items-center
justify-center
text-white
font-bold
shadow-md
flex-shrink-0">

N

</div>

)}

<div
className="
p-4 rounded-2xl
max-w-[75%]
shadow-lg
bg-white">

{msg.content && (

<p>{msg.content}</p>

)}

{msg.image && (

<img
src={msg.image}
alt="upload"
className="
mt-2
rounded-xl
max-h-48
shadow-lg"
/>

)}

</div>

</div>

))

)}

{loading && (

<div className="flex gap-2 pl-16">

<div className="w-3 h-3 bg-teal-500 rounded-full animate-bounce"></div>
<div className="w-3 h-3 bg-teal-500 rounded-full animate-bounce delay-150"></div>
<div className="w-3 h-3 bg-teal-500 rounded-full animate-bounce delay-300"></div>

</div>

)}

<div ref={chatEndRef} />

</div>


{/* INPUT */}

<div className="p-6 border-t bg-white/90">

<div className="flex gap-3 items-center">

<input
ref={inputRef}
className="
flex-1 px-5 py-4
rounded-2xl
border border-teal-200
focus:ring-2
focus:ring-teal-300
outline-none"

placeholder="Hey Buddy… how are you feeling?"

onKeyDown={(e) => {

if (
e.key === "Enter" &&
!e.shiftKey
) {

e.preventDefault();
handleSend();

}

}}

disabled={loading}
/>

<input
ref={fileInputRef}
type="file"
accept="image/*"
className="hidden"
id="companion-upload"

onChange={(e) =>
setImageFile(
e.target.files?.[0] ?? null
)
}
/>

<label
htmlFor="companion-upload"
className="
cursor-pointer
p-4
rounded-xl
bg-teal-100
hover:bg-teal-200">

📷

</label>

<button
onClick={handleSend}
disabled={loading}
className="
px-7 py-4
rounded-xl
font-bold
text-white
bg-gradient-to-r
from-teal-500
to-cyan-500
hover:scale-105
transition">

Send

</button>

</div>

</div>

</div>

</div>

)}

</div>

  );

};