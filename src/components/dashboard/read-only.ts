"use client";

import { createContext, use } from "react";

/**
 * True on a team's public link. The tabs hide anything that writes or opens the
 * coach's tools there. The server refuses those for anyone signed out regardless.
 */
export const ReadOnly = createContext(false);

export const useReadOnly = () => use(ReadOnly);
