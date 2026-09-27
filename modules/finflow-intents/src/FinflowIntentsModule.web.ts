import { registerWebModule, NativeModule } from 'expo';

class FinflowIntentsModule extends NativeModule<{}> {}

export default registerWebModule(FinflowIntentsModule, 'FinflowIntentsModule');
