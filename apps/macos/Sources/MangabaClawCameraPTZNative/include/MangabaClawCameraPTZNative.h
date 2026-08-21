#ifndef MANGABACLAW_CAMERA_PTZ_NATIVE_H
#define MANGABACLAW_CAMERA_PTZ_NATIVE_H

#include <stddef.h>
#include <stdint.h>

typedef struct MangabaClawUVCController MangabaClawUVCController;

int mangabaclaw_uvc_parse_camera_terminal(
    const uint8_t *descriptors,
    size_t descriptors_length,
    uint8_t *terminal_id_out,
    uint32_t *controls_out
);

int mangabaclaw_uvc_open(
    uint32_t location_id,
    uint16_t vendor_id,
    uint16_t product_id,
    MangabaClawUVCController **controller_out,
    uint32_t *controls_out,
    char **error_out
);

int mangabaclaw_uvc_control(
    MangabaClawUVCController *controller,
    uint8_t selector,
    uint8_t request,
    void *data,
    uint16_t length,
    char **error_out
);

void mangabaclaw_uvc_close(MangabaClawUVCController *controller);

#endif
