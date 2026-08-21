import Observation
import MangabaClawChatUI
import SwiftUI

@MainActor
struct ChatModelControlsMenuItems: View {
    @Bindable var viewModel: MangabaClawChatViewModel

    var body: some View {
        if self.viewModel.showsModelPicker {
            self.modelPicker
        }
        if self.viewModel.showsThinkingPicker {
            self.thinkingPicker
        }
        if self.viewModel.selectedModelSupportsFastMode {
            self.fastModePicker
        }
        self.verbosityPicker
    }

    private var modelPicker: some View {
        let sections = self.viewModel.modelPickerSections
        return Picker(selection: Binding(
            get: { self.viewModel.modelSelectionID },
            set: { self.viewModel.selectModel($0) }))
        {
            Text(self.viewModel.defaultModelLabel)
                .font(MangabaClawType.body)
                .tag(MangabaClawChatViewModel.defaultModelSelectionID)
            if !sections.pinned.isEmpty {
                Section("Pinned") {
                    self.modelOptions(sections.pinned)
                }
            }
            if !sections.recent.isEmpty {
                Section("Recent") {
                    self.modelOptions(sections.recent)
                }
            }
            ForEach(sections.providers) { provider in
                Section {
                    self.modelOptions(provider.models)
                } header: {
                    HStack(spacing: 4) {
                        Text(provider.displayName)
                            .font(MangabaClawType.body)
                        if provider.isDefaultProvider {
                            Text("Default")
                                .font(MangabaClawType.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } label: {
            Text("Model")
                .font(MangabaClawType.body)
        }
        .disabled(self.viewModel.isUpdatingSessionSettings)
    }

    private var thinkingPicker: some View {
        Picker(selection: Binding(
            get: { self.viewModel.thinkingSelectionID },
            set: { self.viewModel.selectThinkingLevel($0) }))
        {
            Text("Default (inherited)")
                .font(MangabaClawType.body)
                .tag(MangabaClawChatViewModel.inheritedThinkingSelectionID)
            ForEach(self.viewModel.thinkingLevelOptions) { option in
                Text(verbatim: option.label)
                    .font(MangabaClawType.body)
                    .tag(option.id)
            }
        } label: {
            Text("Thinking")
                .font(MangabaClawType.body)
        }
        .disabled(self.viewModel.isUpdatingSessionSettings)
    }

    private var fastModePicker: some View {
        Picker(selection: Binding(
            get: { self.viewModel.fastModeSelectionID },
            set: { self.viewModel.selectFastMode($0) }))
        {
            Text("Default (inherited)")
                .font(MangabaClawType.body)
                .tag(MangabaClawChatViewModel.inheritedThinkingSelectionID)
            Text("On")
                .font(MangabaClawType.body)
                .tag("on")
            Text("Off")
                .font(MangabaClawType.body)
                .tag("off")
        } label: {
            Label {
                Text("Fast")
                    .font(MangabaClawType.body)
            } icon: {
                Image(systemName: "bolt.fill")
            }
        }
        .disabled(self.viewModel.isUpdatingSessionSettings)
    }

    private var verbosityPicker: some View {
        Picker(selection: Binding(
            get: { self.viewModel.verboseLevel },
            set: { self.viewModel.selectVerboseLevel($0) }))
        {
            Text("Default (inherited)")
                .font(MangabaClawType.body)
                .tag(MangabaClawChatViewModel.inheritedThinkingSelectionID)
            Text("Off")
                .font(MangabaClawType.body)
                .tag("off")
            Text("On")
                .font(MangabaClawType.body)
                .tag("on")
            Text("Full")
                .font(MangabaClawType.body)
                .tag("full")
        } label: {
            Text("Verbosity")
                .font(MangabaClawType.body)
        }
        .disabled(self.viewModel.isUpdatingSessionSettings)
    }

    private func modelOptions(_ models: [MangabaClawChatModelChoice]) -> some View {
        ForEach(models) { model in
            HStack(spacing: 4) {
                Text(model.displayLabel)
                    .font(MangabaClawType.body)
                if self.viewModel.isDefaultModel(model) {
                    Text("Default")
                        .font(MangabaClawType.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .tag(model.selectionID)
        }
    }
}
