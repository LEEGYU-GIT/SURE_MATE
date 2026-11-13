// node --experimental-transform-types --import ./lib/register-ts.mjs …: lets video scripts import the app's TypeScript sources
import { register } from 'node:module'

register('./ts-hook.mjs', import.meta.url)
