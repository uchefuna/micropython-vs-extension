"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
// Make sure the file exists at the specified path, or update the path if necessary
const DeviceTreeDataProvider_1 = require("./utils/DeviceTreeDataProvider");
const micropyproviderdata_1 = require("./utils/micropyproviderdata");
// import { menuToolBarIcons } from './utils/menutoolbar';
// let rootFolderSet = false;
function activate(context) {
    // const outputChannel = vscode.window.createOutputChannel("MicroPython Uploader");
    vscode.window.showInformationMessage(`Starting Micropython Upload process...`);
    console.log("Starting Micropython Delete and Upload Process.....");
    // Register the DeviceTreeDataProvider
    const deviceTreeDataProvider = new DeviceTreeDataProvider_1.DeviceTreeDataProvider();
    vscode.window.registerTreeDataProvider('micropythonDeviceView', deviceTreeDataProvider);
    // Get both commands
    const { selectRootFolder, otherOperation } = (0, micropyproviderdata_1.micropyProviderData)(deviceTreeDataProvider);
    // Register commands for proper disposal
    context.subscriptions.push(selectRootFolder, otherOperation);
    // Command to select a root folder
    // const selectRootFolder = vscode.commands.registerCommand('micropython-vs-extension.selectRootFolder', async () => {
    //   const folderUri = await vscode.window.showOpenDialog({
    //     canSelectFolders: true,
    //     openLabel: 'Select Root Folder'
    //   });
    //   if (folderUri && folderUri.length > 0) {
    //     vscode.workspace.updateWorkspaceFolders(0, null, { uri: folderUri[0] });
    //     vscode.window.showInformationMessage(`Root folder set: ${folderUri[0].fsPath}`);
    //   }
    // Schedule menuToolBarIcons asynchronously so it doesn't block activate
    // setImmediate(() => {
    //   menuToolBarIcons(context);
    // });
    // // Command 1: Select Root Folder
    // const selectRootFolder = vscode.commands.registerCommand('micropython-vs-extension.selectRootFolder', async () => {
    //   const folderUri = await vscode.window.showOpenDialog({
    //     canSelectFolders: true,
    //     openLabel: 'Select Root Folder'
    //   });
    //   if (folderUri && folderUri.length > 0) {
    //     vscode.workspace.updateWorkspaceFolders(0, null, { uri: folderUri[0] });
    //     vscode.window.showInformationMessage(`Root folder set: ${folderUri[0].fsPath}`);
    //     rootFolderSet = true;
    //     // After setting root folder, refresh the context to update UI
    //     vscode.commands.executeCommand('setContext', 'micropython-vs-extension.rootFolderSet', true);
    //   }
    // });
    // // Command 2: Your other operation command
    // const otherOperation = vscode.commands.registerCommand('micropython-vs-extension.otherOperation', () => {
    //   vscode.window.showInformationMessage('Other operation executed.');
    // });
    // context.subscriptions.push(selectRootFolder, otherOperation);
    // // Initialize context for button visibility
    // vscode.commands.executeCommand('setContext', 'micropython-vs-extension.rootFolderSet', false);
    // // });
    // context.subscriptions.push(selectRootFolder);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map