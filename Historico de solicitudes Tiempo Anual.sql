SELECT
    H.id_m_solicitud AS SOLICITUD,
    H.his_msol_estado AS [ID ESTADO],
    ES.nombre_estado AS ESTADO,
    H.comentario AS COMENTARIO,

    S.msol_fecha_crea AS [FECHA CREACION],
    H.his_msol_fecha_modifica AS [FECHA MODIFICACION],

    H.his_msol_usuario_modifica AS [ID USUARIO MODIFICA],

    CONCAT(
        U.usu_nombre, ' ',
        U.usu_apellido1, ' ',
        U.usu_apellido2
    ) AS [USUARIO MODIFICA],

    SD.suc_det_nombre AS [SUCURSAL USUARIO],

    COALESCE(
        MR.nombre_motivo_rechazo,
        'Sin Motivo'
    ) AS MOTIVO_PREANALISIS,

    'Sin Motivo' AS MOTIVO_RECHAZO_RECEPCION

FROM [GENESIS_REGIONAL].[dwh].[hech_historico_maestro_solicitud] H

LEFT JOIN [GENESIS_REGIONAL].[dwh].[hech_maestro_solicitud] S
    ON H.id_m_solicitud = S.id_m_solicitud
    AND H.id_pais = S.id_pais

LEFT JOIN [GENESIS_REGIONAL].[dwh].[dim_estado_solicitud] ES
    ON H.his_msol_estado = ES.id_estado
    AND H.id_pais = ES.id_pais

LEFT JOIN [GENESIS_REGIONAL].[dwh].[dim_t_usuario] U
    ON H.his_msol_usuario_modifica = U.id_usuario
    AND H.id_pais = U.id_pais

LEFT JOIN [GENESIS_REGIONAL].[dwh].[dim_t_sucursal_detalle] SD
    ON S.id_sucursal_origen = SD.id_sucursal_detalle
    AND S.id_pais = SD.id_pais

LEFT JOIN [GENESIS_REGIONAL].[dwh].[dim_motivo_rechazo] MR
    ON H.id_motivo_rechazo = MR.id_motivo_rechazo
    AND H.id_pais = MR.id_pais

WHERE
    S.id_pais = 2
    AND S.msol_fecha_crea >= DATEADD(
        MONTH, -9,
        DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
    )
    AND S.msol_fecha_crea < DATEADD(
        MONTH, 0,
        DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
    )
	AND H.his_msol_estado>0 

ORDER BY
    S.msol_fecha_crea ASC,
    H.his_msol_fecha_modifica desc;