import asyncio
import os
import re
from typing import TypedDict

import uvicorn
from aiorwlock import RWLock
from fastapi import FastAPI, HTTPException
from fastapi import Response
import valkey.asyncio as valkey
from fastapi.middleware.cors import CORSMiddleware


REP_STEP = 0.1
START_REP = 0.7


class ReputationReturnType(TypedDict):
    """
    Reputation closer to 1:
        - human made
        - not manipulated with AI
    Reputation closer to 0:
        - non-human made
        - likely to be entirely AI-generated
    All user-submitted images start at 0.5
    """

    reputation: float


class ReputationPutType(TypedDict):
    """
    Contains just one field:
        - trust: true
    If trust is true, increment the reputation
    If trust is false, decrement the reputation
    """

    trust: bool


async def main():
    valkey_client = await valkey.from_url("valkey://localhost")

    app = FastAPI()
    ## HASH IS A HEX-ENCODED SHA256 HASH OF THE MEDIA IN QUESTION

    UPDATE_LOCK = RWLock()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/{hash}")
    async def get_reputation(hash: str, response: Response) -> ReputationReturnType:
        if not re.fullmatch(r"[0-9a-fA-F]{64}", hash):
            raise HTTPException(
                status_code=400,
                detail="Hash must be a 64-character hexadecimal string.",
            )
    
        # Set cache header
        response.headers["Cache-Control"] = "public, max-age=300"
        
        async with UPDATE_LOCK.reader:
            current_rep = float(await valkey_client.get(hash) or START_REP)
            return {
                "reputation": current_rep,
            }

    @app.put("/{hash}")
    async def put_reputation(hash: str, reputation_put: ReputationPutType) -> None:
        # global lock on updates is slow but will always work
        if not re.fullmatch(r"[0-9a-fA-F]{64}", hash):
            raise HTTPException(
                status_code=400,
                detail="Hash must be a 64-character hexadecimal string.",
            )
        async with UPDATE_LOCK.reader:
            existing_rep = float(await valkey_client.get(hash) or START_REP)
            if reputation_put["trust"]:
                new_rep = min(1, existing_rep + REP_STEP)
            else:
                new_rep = max(0, existing_rep - REP_STEP)
            await valkey_client.set(hash, new_rep)

    config = uvicorn.Config(app, host="127.0.0.1", port=8000)
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
