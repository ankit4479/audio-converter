/**
 * Registers every built-in ConverterModule with the platform registry (E0.2,
 * issue #22). Imported once, for its side effect, from root.tsx - which wraps every
 * route, so by the time any component renders and looks a module up via
 * registry.get(), it's already there no matter which page was entered first.
 * The only module today is audio (#23); a second module's registration joins
 * this file when it exists.
 */
import { register } from '../platform/registry'
import { audioModule } from './audio'

register(audioModule)
