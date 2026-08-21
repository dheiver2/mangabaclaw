import MangabaClawKit
import SwiftUI

extension AgentProTab {
    func detailMetric(label: MangabaClawTextValue, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            label.text
                .font(MangabaClawType.caption2Medium)
                .foregroundStyle(.secondary)
            Text(verbatim: value)
                .font(MangabaClawType.subheadSemiBold)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            Color.primary.opacity(0.055),
            in: RoundedRectangle(cornerRadius: MangabaClawRadius.sm, style: .continuous))
    }

    func emptyDetailRow(
        icon: String,
        title: MangabaClawTextValue,
        detail: MangabaClawTextValue) -> some View
    {
        HStack(spacing: 12) {
            ProIconBadge(systemName: icon, color: .secondary)
            VStack(alignment: .leading, spacing: 3) {
                title.text
                    .font(MangabaClawType.subheadSemiBold)
                detail.text
                    .font(MangabaClawType.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
        }
    }
}
