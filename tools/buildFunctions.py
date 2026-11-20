"""Build a JSON file containing help for GLSL builtin functions."""

import json
import os
import re
import time

import requests

from bs4 import BeautifulSoup

functions = [
    dict(
        functionName="iFrame", oneLiner="The index of the current frame.",
        signatures=["int iFrame"],
    ),
    dict(
        functionName="iTime",
        oneLiner=(
            "The time into the animation that the current frame is being "
            "rendered at."),
        signatures=["float iTime"],
    ),
    dict(
        functionName="iPrevFrame",
        oneLiner="The contents of the previously rendered frame.",
        signatures=["sampler2D iPrevFrame"],
    ),
    dict(
        functionName="iResolution",
        oneLiner="The resolution of the frame being rendered in pixels.",
        signatures=["vec2 iResolution"],
    ),
    dict(
        functionName="iDuration",
        oneLiner="The total duration of the animation in seconds.",
        signatures=["float iDuration"],
    ),
]

for i in range(8):
    functions += dict(
        functionName=f"iTexture{i}",
        oneLiner=f"The contents of the texture loaded as iTexture{i}.",
        signatures=[f"sampler2D iTexture{i}"],
    ),

for i in range(16):
    functions += dict(
        functionName=f"iFloat{i}",
        oneLiner=f"The value of the animated variable iFloat{i}.",
        signatures=[f"float iFloat{i}"],
    ),

for i in range(4):
    functions += dict(
        functionName=f"iBuffer{i}",
        oneLiner=f"What the buffer iBuffer{i} drew most recently.",
        signatures=[f"sampler2D iBuffer{i}"],
    ),


builtins = (
    "greaterThanEqual acos acosh asin asinh atan atanh cos cosh degrees radians sin sinh tan tanh "  # NOQA: E501
    "abs ceil clamp dFdx dFdy exp exp2 floor floor fma fract fwidth inversesqrt isinf isnan log log2 max min mix mod modf pow round roundEven sign smoothstep sqrt step trunc "  # NOQA: E501
    "floatBitsToInt frexp intBitsToFloat ldexp packHalf2x16 packUnorm unpackHalf2x16 unpackUnorm "  # NOQA: E501
    "cross distance dot equal faceforward length normalize notEqual reflect refract "  # NOQA: E501
    "all any greaterThan greaterThanEqual lessThan lessThanEqual not "  # NOQA: E501
    "texelFetch texelFetchOffset texture textureGather textureGatherOffset textureGrad textureGradOffset textureLod textureLodOffset textureOffset textureProj textureProjGrad textureProjGradOffset textureProjLod textureProjLodOffset textureProjOffset textureSize "  # NOQA: E501
    "determinant groupMemoryBarrier inverse matrixCompMult outerProduct transpose "  # NOQA: E501
    "bitCount bitfieldExtract bitfieldInsert bitfieldReverse findLSB findMSB uaddCarry umulExtended usubBorrow "  # NOQA: E501
).split()

for builtin in builtins:
    try:
        url = (
            "https://raw.githubusercontent.com/BSVino/docs.gl/mainline/el3/"
            f"{builtin}.xhtml")

        html = requests.get(url).content.decode("utf-8")
        redirect = re.match(
            r"<script>window\.location\.replace\(\"(.*)\"", html.strip())
        if redirect:
            redirected_to = redirect.group(1)
            url = (
                "https://raw.githubusercontent.com/BSVino/docs.gl/mainline/"
                f"el3/{redirected_to}.xhtml")
            html = requests.get(url).content
            print("redirected", builtin, "->", redirected_to)

        bs = BeautifulSoup(html, 'html.parser')
        one_liner = bs.select('div.refnamediv p')[0].get_text()
        if "— " in one_liner:
            one_liner = one_liner.split("— ")[1]
        one_liner = one_liner.strip()
        one_liner = one_liner[0].upper() + one_liner[1:]
        if not one_liner.endswith("."):
            one_liner += "."
        signatures = bs.select('table.funcprototype-table')
        signatures = [
            x.get_text().replace("\n", "").replace("\xa0", "").rstrip(";")
            for x in signatures]
        signatures = [
            x for x in signatures
            if builtin in x
        ]
        functions.append(
            dict(functionName=builtin, oneLiner=one_liner,
                 signatures=signatures,
                 helpUrl=f"https://docs.gl/el3/{builtin}")
        )
        time.sleep(0.01)
    except Exception:
        print("Error on", builtin)
        raise

with open(os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "src", "editor", "glslFunctions.json"), "w") as f:
    f.write(json.dumps(functions, indent=4))
