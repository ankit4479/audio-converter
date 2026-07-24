/**
 * Registers every built-in ConverterModule with the platform registry (E0.2,
 * issue #22). Imported once, for its side effect, from App.tsx - by the time any
 * component renders and looks a module up via registry.get(), it's already there.
 * The only module today is audio (#23); a second module's registration joins
 * this file when it exists.
 */
import { register } from '../platform/registry'
import { audioModule } from './audio'

register(audioModule)
