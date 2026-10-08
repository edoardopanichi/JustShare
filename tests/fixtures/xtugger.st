PROGRAM XTUGGER_APP
VAR

fb_local_tugger_sm : LOCAL_TUGGER_SM;
fb_force_controller : TB_FORCE_CONTROLLER;
fb_handle_pos_vel_acc : HANDLE_POS_VEL_ACC;
fb_mass_spring_damper : MASS_SPRING_DAMPER;
fb_ma_to_torque : MA_TO_TORQUE;

tb_control_mode : BOOL; 
tb_requested_local_sm_state : UINT;
tb_winch_emergency_stop : BOOL;
tb_mw_drum_velocity_rpm : REAL;

tb_isu_enable_permit : BOOL;
tb_isu_statusword : UINT := 4279;

tb_fault_reset_request : BOOL;

tb_motor_nominal_speed_rpm : REAL := 3000.0;
tb_motor_nominal_torque_nm : REAL := 2.6;
tb_gearbox_ratio : REAL := 50.0;
     
    
(* Active stiffness setting from your main controller (in Nm/deg) *)
tb_rStiffness        : REAL;
tb_rDamping        : REAL;
tb_rMass        : REAL;
    
(* Observed maximum physical load revolution range (e.g. 0.09 revs) *)
tb_rMaxPhysicalRevs  : REAL := 0.09;
    
(* Target angular range in degrees corresponding to max physical travel *)
tb_rTargetMaxDegrees : REAL := 30.0;

(* Execution task cycle time in seconds (e.g. 0.001 s for 1 kHz) *)
tb_rTaskCycleTime_s  : REAL := 0.001;

(* Low-pass filter cutoff frequency in Hz for speed & acceleration smoothing *)
tb_rCutoffFreq_Hz    : REAL := 2.0;

tb_rPosition_rev : REAL;
tb_rPosition_deg : REAL;
tb_rVelocity_deg_s : REAL;
tb_rAcceleration_deg_s2 : REAL;

tb_rTorque_Nm : REAL;
tb_torque_setpoint_nm : REAL;

tb_Kp_Nm_per_deg : REAL := 20;
tb_Ki_Nm_per_deg_s : REAL := 5;
tb_Kd_Nm_s_per_deg : REAL := 0;
tb_N_Filter		: REAL := 20;
tb_MinTensionSetpoint_Nm : REAL := -30;
tb_MaxTensionSetpoint_Nm : REAL := 30;


END_VAR

(* ========================================================================= *)
(* 0. Transformations and scaling                                           *)
(* ========================================================================= *)

tb_mw_drum_velocity_rpm := EPU01_speed_actual_rpm;
tb_winch_emergency_stop := FALSE AND is_bit_set(EPU01_statusword_2, 11); (* SHUNT *)

fb_handle_pos_vel_acc(
    i_uiLoadPos_Low     := PN_1_1_Actual_PZD6,
    i_uiLoadPos_High    := PN_1_1_Actual_PZD5,
    i_rStiffness        := tb_rStiffness,
    i_rMaxPhysicalRevs  := 0.09,
    i_rTargetMaxDegrees := 30.0,
    i_iMotorSpeed_RAW	:= EPU01_speed_actual_rpm,
    i_rSpeedScaling_RPM := tb_motor_nominal_speed_rpm,
    i_rGearRatio        := tb_gearbox_ratio,
    i_rTaskCycleTime_s  := tb_rTaskCycleTime_s,
    i_rCutoffFreq_Hz    := tb_rCutoffFreq_Hz,
);


tb_rPosition_deg := fb_handle_pos_vel_acc.q_rPosition_Deg;
tb_rVelocity_deg_s := fb_handle_pos_vel_acc.q_rSpeed_DegPerSec;
tb_rAcceleration_deg_s2 := fb_handle_pos_vel_acc.q_rAccel_Filt_DegPerSec2;


fb_ma_to_torque(
    i_rCurrent_mA       := DINT_TO_REAL(IO_main_load_cell_ma) * (12.0 / 32500.0), (* Convert raw DINT count directly to physical mA *)
    i_rZeroCurrent_mA   := 12,
    i_rMaxCurrent_mA    := 20,
    i_rMaxForce_N       := 50,
    i_rTorqueArm_m      := 0.25,
);

tb_rTorque_Nm := fb_ma_to_torque.q_rTorque_Nm;

(* ========================================================================= *)
(* 1. Local State Machine                                            *)
(* ========================================================================= *)

fb_local_tugger_sm(
  remote_or_local := FALSE,
  global_sm_control_mode := tb_control_mode,
  requested_local_sm_state := tb_requested_local_sm_state,
  winch_emergency_stop := tb_winch_emergency_stop,
  mw_drum_velocity_rpm := tb_mw_drum_velocity_rpm,
  holding_brakes_status := TRUE,
  isu_enable_permit := tb_isu_enable_permit,
  isu_statusword := tb_isu_statusword,
  isu_hardware_interlocks_ok := TRUE ,
  isu_fault_reset_request := tb_fault_reset_request,
  mw_statusword := EPU01_statusword ,
  lw_statusword := EPU01_statusword,
  mw_hardware_interlocks_ok := TRUE,
  lw_hardware_interlocks_ok := TRUE,
  mw_fault_reset_request := tb_fault_reset_request,
  lw_fault_reset_request := tb_fault_reset_request,
  mw_statusword_2 := EPU01_statusword_2,
  lw_statusword_2 := EPU01_statusword_2,
  min_tension_value_ok := TRUE ,
);

EPU01_controlword := fb_local_tugger_sm.mw_controlword;

(* ========================================================================= *)
(* 2. Motion Controller   (NB Normally runs only on the EPU01) 				*)
(* ========================================================================= *)

fb_mass_spring_damper(
    i_rPosition_deg         := tb_rPosition_deg,
    i_rVelocity_deg_s       := tb_rVelocity_deg_s,
    i_rAcceleration_deg_s2  := tb_rAcceleration_deg_s2,
    i_rStiffness_K           := tb_rStiffness,
    i_rDamping_C             := tb_rDamping,
    i_rMass_J                := tb_rMass,
    i_rTargetPosition_deg    := 0.0,
);

tb_torque_setpoint_nm := -fb_mass_spring_damper.q_rTotalLoadTorque_Nm;

(* ========================================================================= *)
(* 3. Force Controller                                      				*)
(* ========================================================================= *)

fb_force_controller(
    Enable_ForceController     := is_bit_set(EPU01_statusword_2, 2), (*For now*)
    TensionSetpoint_N          := tb_torque_setpoint_nm,
    TensionMeasured_N          := tb_rTorque_Nm, (*For TB this is torque*)
    Kp_Nm_per_deg              := tb_Kp_Nm_per_deg,
    Ki_Nm_per_deg_s            := tb_Ki_Nm_per_deg_s,
    Kd_Nm_s_per_deg            := tb_Kd_Nm_s_per_deg,
    N_Filter				   := tb_N_Filter,	
    CycleTime_s                := tb_rTaskCycleTime_s,
    MinTensionSetpoint_N       := tb_MinTensionSetpoint_Nm, (*For TB this is torque*)
    MaxTensionSetpoint_N       := tb_MaxTensionSetpoint_Nm, (*For TB this is torque*)
);

EPU01_torque_reference_nm := REAL_TO_INT(( fb_force_controller.TorqueCommand_Nm / (2.6 * 50) ) * 10000); (* To be changed to variables *)

(* forward the brake thermal switch to profinet*)
EPU01_brake_resistor_thermal_switch := BOOL_TO_WORD(IO_main_brake_resistor_thermal_switch); 

END_PROGRAM

ACTIONS

END_ACTIONS