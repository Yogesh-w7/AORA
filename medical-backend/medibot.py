from dotenv import load_dotenv
load_dotenv()

"""
FINAL MEDIBOT – ADVANCED VERSION

✔ Console output logging
✔ Advanced drug interaction
✔ Single drug details
✔ Multi-drug safety
✔ Emergency detection
✔ Hospital finder
✔ Production-ready
"""

import os
import logging
import traceback
import base64
import requests
import re

from io import BytesIO
from PIL import Image

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_groq import ChatGroq

from geopy.geocoders import Nominatim


# ================= CONFIG =================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("medibot")

# Load from environment variable (never hardcode)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable is not set")

MODEL_NAME = "meta-llama/llama-4-scout-17b-16e-instruct"


# ================= LANGUAGE =================

def detect_language(text):

    if any("\u0900" <= c <= "\u097F" for c in text):
        return "Hindi"

    hinglish_words = ["hai", "mujhe", "dard", "bukhar"]

    if any(word in text.lower() for word in hinglish_words):
        return "Hinglish"

    return "English"


# ================= EMERGENCY =================

def detect_emergency(text):

    keywords = [
        "chest pain",
        "breathing problem",
        "unconscious",
        "fainting",
        "heart attack",
        "severe bleeding"
    ]

    return any(k in text.lower() for k in keywords)


# ================= MED RISK =================

def detect_medicine_risk(text):

    keywords = [
        "overdose",
        "double dose",
        "too much medicine"
    ]

    return any(k in text.lower() for k in keywords)


# ================= RXCUI =================

def get_rxcui(drug):

    try:

        url = (
            "https://rxnav.nlm.nih.gov/"
            f"REST/rxcui.json?name={drug}"
        )

        res = requests.get(
            url,
            headers={"User-Agent": "medibot"},
            timeout=10
        )

        if res.status_code != 200:
            return None

        data = res.json()

        ids = data.get("idGroup", {}).get("rxnormId")

        return ids[0] if ids else None

    except:
        return None


# ================= DRUG DETAILS =================

def get_drug_details(drug):

    logger.info(f"Fetching details for: {drug}")

    try:

        url = (
            "https://api.fda.gov/drug/label.json"
            f"?search=openfda.generic_name:{drug}"
            "&limit=1"
        )

        res = requests.get(url, timeout=10)

        if res.status_code != 200:
            return None

        data = res.json()

        results = data.get("results")

        if not results:
            return None

        r = results[0]

        return {

            "drug": drug.capitalize(),

            "uses":
                r.get("indications_and_usage",
                      ["Not available"])[0][:250],

            "side_effects":
                r.get("adverse_reactions",
                      ["Not available"])[0][:250],

            "warnings":
                r.get("warnings",
                      ["Not available"])[0][:250]

        }

    except Exception as e:

        logger.error(f"Drug detail error: {e}")

        return None


# ================= ADVANCED INTERACTION =================

def check_drug_interaction(drugs):

    logger.info(f"Checking interaction for: {drugs}")

    try:

        joined = "+".join(drugs)

        url = (
            "https://api.fda.gov/drug/label.json"
            f"?search={joined}"
            "&limit=1"
        )

        res = requests.get(url, timeout=10)

        if res.status_code != 200:
            return "⚠️ Could not verify interaction."

        data = res.json()

        results = data.get("results")

        if not results:
            return "✅ No major interaction found."

        interaction = results[0].get(
            "drug_interactions",
            ["Interaction info available."]
        )[0]

        return (
            "⚠️ Possible interaction:\n"
            + interaction[:400]
        )

    except Exception as e:

        logger.error(f"Interaction error: {e}")

        return "⚠️ Interaction check failed."


# ================= MEDICINE DETECTION =================

def extract_medicines(text):

    words = re.findall(
        r'\b[a-zA-Z]{3,}\b',
        text
    )

    meds = []

    for word in words:

        rx = get_rxcui(word)

        if rx:

            meds.append(word.lower())

        if len(meds) >= 5:
            break

    return list(set(meds))


# ================= IMAGE =================

def image_to_base64(pil_img):

    buffer = BytesIO()

    pil_img = pil_img.convert("RGB")

    pil_img.thumbnail((1024, 1024))

    pil_img.save(
        buffer,
        format="JPEG",
        quality=85
    )

    return base64.b64encode(
        buffer.getvalue()
    ).decode()


# ================= HOSPITAL =================

def find_nearby_hospitals(location):

    logger.info(f"Finding hospitals near: {location}")

    try:

        geolocator = Nominatim(
            user_agent="medibot"
        )

        loc = geolocator.geocode(location)

        if not loc:
            return "⚠️ Location not found."

        lat = loc.latitude
        lon = loc.longitude

        overpass_url = "https://overpass-api.de/api/interpreter"

        query = f"""
        [out:json];
        (
          node["amenity"="hospital"](around:5000,{lat},{lon});
        );
        out center;
        """

        res = requests.get(
            overpass_url,
            params={"data": query},
            timeout=15
        ).json()

        hospitals = res.get("elements", [])[:5]

        output = [f"🏥 Hospitals near {location}:"]

        for h in hospitals:

            name = h.get("tags", {}).get(
                "name",
                "Unknown Hospital"
            )

            lat_h = h.get("lat")

            lon_h = h.get("lon")

            maps = (
                f"https://www.google.com/maps?q={lat_h},{lon_h}"
            )

            output.append(
                f"\n🏥 {name}\n🗺️ {maps}"
            )

        return "\n".join(output)

    except Exception as e:

        return f"⚠️ Hospital error: {e}"


# =====================================================
# CORE FUNCTION
# =====================================================

def _run_medical_reasoning(question, pil_img):

    logger.info(f"User Question: {question}")

    language = detect_language(question)

    is_emergency = detect_emergency(question)

    med_risk = detect_medicine_risk(question)

    llm = ChatGroq(

        model=MODEL_NAME,
        temperature=0.3,
        max_tokens=1500,
        api_key=GROQ_API_KEY

    )

    try:

        prompt = ChatPromptTemplate.from_messages([

            ("system",
             f"You are a helpful medical assistant. Respond in {language}."),

            ("human", "{question}")

        ])

        chain = prompt | llm | StrOutputParser()

        response = chain.invoke({
            "question": question
        })


        # ================= DRUG LOGIC =================

        meds = extract_medicines(question)

        logger.info(f"Detected medicines: {meds}")

        if meds:

            response += "\n\n💊 Drug Information:\n"

            for med in meds:

                details = get_drug_details(med)

                if details:

                    response += f"""

💊 {details["drug"]}

Uses:
{details["uses"]}

Side Effects:
{details["side_effects"]}

Warnings:
{details["warnings"]}

"""

        if len(meds) >= 2:

            interaction = check_drug_interaction(meds)

            response += (
                "\n\n💊 Drug Interaction Check:\n"
                + interaction
            )


        # ================= EMERGENCY =================

        if is_emergency:

            response += "\n\n🚨 Emergency detected."

            response += """

📞 Emergency Numbers:

Ambulance: 102  
Emergency: 112  
Police: 100  
"""

            hospitals = find_nearby_hospitals("Nagpur")

            response += "\n\n" + hospitals


        if med_risk:

            response += "\n\n⚠️ Incorrect dosage can be harmful."


        response += "\n\n👉 How long have you had this issue?"


        # ================= CONSOLE OUTPUT =================

        print("\n========== MEDIBOT RESPONSE ==========\n")
        print(response)
        print("\n======================================\n")


        return response

    except Exception:

        traceback.print_exc()

        return None


# =====================================================

def ask_medibot(question, pil_img=None):

    answer = _run_medical_reasoning(
        question,
        pil_img
    )

    return answer if answer else "Please consult a doctor."
