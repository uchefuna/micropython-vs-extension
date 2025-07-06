

import * as vscode from 'vscode';

import { isRootWorkFolder } from './currentfolderstate';


export class DeviceTreeDataProvider implements vscode.TreeDataProvider<DeviceTreeItem> {
  constructor(
    private ctx: vscode.ExtensionContext,
    private ROOT_MULTI_FOLDER_KEY: string
  ) { }

  private _onDidChangeTreeData: vscode.EventEmitter<DeviceTreeItem | undefined | void> = new vscode.EventEmitter<DeviceTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<DeviceTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private rootFolderSet = false;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setRootFolderSet(value: boolean) {
    this.rootFolderSet = value;
    this.refresh();
  }

  getTreeItem(element: DeviceTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DeviceTreeItem): Promise<DeviceTreeItem[]> {
    const items: DeviceTreeItem[] = [];

    console.log(`rootFolderSet: ${this.rootFolderSet}`);
    const isRootFolder = await isRootWorkFolder(this.ctx, this.ROOT_MULTI_FOLDER_KEY);
    console.log(`isRootFolder: ${isRootFolder}`);

    // if (!isRootFolder) {
    if (!this.rootFolderSet) {
      const folderSelector = new DeviceTreeItem(
        'Select Root Folder',
        // vscode.TreeItemCollapsibleState.None,
        {
          command: 'micropython-vs-extension.selectRootFolder',
          title: 'Select Root Folder',
          arguments: []
        }
      );
      folderSelector.iconPath = new vscode.ThemeIcon('folder');
      items.push(folderSelector);
    }
    // }

    const item2 = new DeviceTreeItem(
      'Other Operation',
      // vscode.TreeItemCollapsibleState.None,
      {
        command: 'micropython-vs-extension.otherOperation',
        title: 'Other Operation',
        arguments: []
      }
    );
    item2.iconPath = new vscode.ThemeIcon('gear');
    items.push(item2);

    return Promise.resolve(items);
  }
}

export class DeviceTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    // public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    // super(label, collapsibleState);
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(label === 'Select Root Folder' ? 'folder' : 'gear');
    this.contextValue = 'deviceTreeItem'; // Optional: for context menus
    this.tooltip = label;
  }
}
